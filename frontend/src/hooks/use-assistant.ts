import { useQuery } from '@tanstack/react-query'
import { useCallback, useEffect, useReducer, useRef } from 'react'

import { getAssistantStatus, streamChat } from '@/api/assistant'
import { ApiError } from '@/api/client'
import type { AssistantCard, AssistantEvent, ChatTurn, PageContext } from '@/api/types'

export interface ToolStep {
  id: string
  name: string
  args?: Record<string, unknown>
  state: 'running' | 'ok' | 'error'
  error?: string
  elapsedMs?: number
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  steps: ToolStep[]
  cards: AssistantCard[]
  status: 'streaming' | 'done' | 'error' | 'stopped'
  error?: string
}

/** What Ember is doing: waiting, looking at data, or talking. */
export type Phase = 'idle' | 'thinking' | 'working' | 'speaking'

export interface ChatState {
  messages: ChatMessage[]
  phase: Phase
}

export type ChatAction =
  | { type: 'ask'; id: string; replyId: string; content: string }
  | { type: 'event'; event: AssistantEvent }
  | { type: 'fail'; error: string }
  | { type: 'stop' }
  | { type: 'drop_failed' }
  | { type: 'reset' }

export const initialChat: ChatState = { messages: [], phase: 'idle' }

function updateLast(s: ChatState, fn: (m: ChatMessage) => ChatMessage): ChatMessage[] {
  const last = s.messages.at(-1)
  if (!last || last.role !== 'assistant') return s.messages
  return [...s.messages.slice(0, -1), fn(last)]
}

export function chatReducer(s: ChatState, a: ChatAction): ChatState {
  switch (a.type) {
    case 'ask':
      return {
        phase: 'thinking',
        messages: [
          ...s.messages,
          { id: a.id, role: 'user', content: a.content, steps: [], cards: [], status: 'done' },
          {
            id: a.replyId,
            role: 'assistant',
            content: '',
            steps: [],
            cards: [],
            status: 'streaming',
          },
        ],
      }
    case 'event': {
      const e = a.event
      switch (e.type) {
        case 'tool_start':
          return {
            phase: 'working',
            messages: updateLast(s, (m) => ({
              ...m,
              steps: [...m.steps, { id: e.id, name: e.name, args: e.args, state: 'running' }],
            })),
          }
        case 'tool_end': {
          const messages = updateLast(s, (m) => ({
            ...m,
            steps: m.steps.map((st) =>
              st.id === e.id
                ? { ...st, state: e.ok ? 'ok' : 'error', error: e.error, elapsedMs: e.elapsed_ms }
                : st,
            ),
            cards: e.card ? [...m.cards, e.card] : m.cards,
          }))
          const running = messages.at(-1)?.steps.some((st) => st.state === 'running')
          return { messages, phase: running ? 'working' : 'thinking' }
        }
        case 'text':
          return {
            phase: 'speaking',
            messages: updateLast(s, (m) => ({ ...m, content: m.content + e.text })),
          }
        case 'done':
          return {
            phase: 'idle',
            messages: updateLast(s, (m) =>
              m.status === 'streaming' ? { ...m, status: 'done' } : m,
            ),
          }
        case 'error':
          return chatReducer(s, { type: 'fail', error: e.error })
      }
      return s
    }
    case 'fail':
      return {
        phase: 'idle',
        messages: updateLast(s, (m) => ({ ...m, status: 'error', error: a.error })),
      }
    case 'stop':
      return {
        phase: 'idle',
        messages: updateLast(s, (m) =>
          m.status === 'streaming'
            ? {
                ...m,
                status: 'stopped',
                steps: m.steps.map((st) =>
                  st.state === 'running' ? { ...st, state: 'error' } : st,
                ),
              }
            : m,
        ),
      }
    case 'drop_failed':
      return { ...s, messages: dropFailed(s.messages) }
    case 'reset':
      return initialChat
  }
}

/** The messages without a last answer that failed or was stopped, and its question. */
export function dropFailed(messages: ChatMessage[]): ChatMessage[] {
  const last = messages.at(-1)
  if (last?.role !== 'assistant' || last.status === 'done' || last.status === 'streaming') {
    return messages
  }
  return messages.slice(0, messages.at(-2)?.role === 'user' ? -2 : -1)
}

/** The turns to send: answered history plus the new question. */
export function toTurns(messages: ChatMessage[], question: string): ChatTurn[] {
  const turns: ChatTurn[] = []
  for (const m of messages) {
    if (m.role === 'assistant' && (m.status !== 'done' || !m.content.trim())) {
      // drop a failed answer and the question it leaves unanswered
      if (turns.at(-1)?.role === 'user') turns.pop()
      continue
    }
    turns.push({ role: m.role, content: m.content })
  }
  turns.push({ role: 'user', content: question })
  return turns
}

let seq = 0
const nextId = () => `m${Date.now().toString(36)}${(seq++).toString(36)}`

export function useAssistant(context?: PageContext) {
  const [state, dispatch] = useReducer(chatReducer, initialChat)
  const abort = useRef<AbortController | null>(null)
  const stateRef = useRef(state)
  useEffect(() => {
    stateRef.current = state
  }, [state])

  const run = useCallback(
    async (question: string, history: ChatMessage[]) => {
      const q = question.trim()
      if (!q || stateRef.current.phase !== 'idle') return
      const turns = toTurns(history, q)
      dispatch({ type: 'ask', id: nextId(), replyId: nextId(), content: q })
      const ctrl = new AbortController()
      abort.current = ctrl
      try {
        await streamChat(
          { messages: turns, context },
          (event) => dispatch({ type: 'event', event }),
          ctrl.signal,
        )
        // a stream that ends without "done" still ends the answer
        dispatch({ type: 'event', event: { type: 'done' } })
      } catch (err) {
        if (ctrl.signal.aborted) return
        const msg =
          err instanceof ApiError || err instanceof Error
            ? err.message
            : 'Ember could not answer. Try again.'
        dispatch({ type: 'fail', error: msg })
      } finally {
        if (abort.current === ctrl) abort.current = null
      }
    },
    [context],
  )

  const send = useCallback((q: string) => run(q, stateRef.current.messages), [run])

  /** Asks the last question again, replacing the failed answer. */
  const retry = useCallback(
    (q: string) => {
      const history = dropFailed(stateRef.current.messages)
      dispatch({ type: 'drop_failed' })
      return run(q, history)
    },
    [run],
  )

  const stop = useCallback(() => {
    abort.current?.abort()
    dispatch({ type: 'stop' })
  }, [])

  const reset = useCallback(() => {
    abort.current?.abort()
    dispatch({ type: 'reset' })
  }, [])

  return { ...state, send, retry, stop, reset }
}

export function useAssistantStatus() {
  return useQuery({
    queryKey: ['assistant', 'status'],
    queryFn: ({ signal }) => getAssistantStatus(signal),
    staleTime: 5 * 60_000,
  })
}
