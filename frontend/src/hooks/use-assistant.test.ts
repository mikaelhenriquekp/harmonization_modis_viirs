import { describe, expect, it } from 'vitest'

import { chatReducer, dropFailed, initialChat, toTurns, type ChatState } from './use-assistant'

function asked(): ChatState {
  return chatReducer(initialChat, {
    type: 'ask',
    id: 'u1',
    replyId: 'a1',
    content: 'Is Greece burning?',
  })
}

describe('chatReducer', () => {
  it('follows an answer: tools, cards, text, done', () => {
    let s = asked()
    expect(s.phase).toBe('thinking')
    s = chatReducer(s, {
      type: 'event',
      event: { type: 'tool_start', id: 't1', name: 'get_calendar' },
    })
    s = chatReducer(s, {
      type: 'event',
      event: { type: 'tool_start', id: 't2', name: 'get_sensors' },
    })
    expect(s.phase).toBe('working')
    s = chatReducer(s, {
      type: 'event',
      event: {
        type: 'tool_end',
        id: 't1',
        name: 'get_calendar',
        ok: true,
        elapsed_ms: 420,
        card: { kind: 'calendar', title: 'Greece', data: {} },
      },
    })
    expect(s.phase).toBe('working') // t2 still runs
    s = chatReducer(s, {
      type: 'event',
      event: { type: 'tool_end', id: 't2', name: 'get_sensors', ok: false, error: 'bad month' },
    })
    expect(s.phase).toBe('thinking')
    s = chatReducer(s, { type: 'event', event: { type: 'text', text: 'Below ' } })
    s = chatReducer(s, { type: 'event', event: { type: 'text', text: 'usual.' } })
    expect(s.phase).toBe('speaking')
    s = chatReducer(s, { type: 'event', event: { type: 'done' } })

    const reply = s.messages[1]
    expect(s.phase).toBe('idle')
    expect(reply.content).toBe('Below usual.')
    expect(reply.status).toBe('done')
    expect(reply.steps.map((st) => st.state)).toEqual(['ok', 'error'])
    expect(reply.steps[0].elapsedMs).toBe(420)
    expect(reply.cards).toHaveLength(1)
  })

  it('keeps an error when the stream ends after it', () => {
    let s = chatReducer(asked(), {
      type: 'event',
      event: { type: 'error', error: 'lost the model' },
    })
    s = chatReducer(s, { type: 'event', event: { type: 'done' } })
    expect(s.messages[1].status).toBe('error')
    expect(s.messages[1].error).toBe('lost the model')
  })

  it('stops a running answer', () => {
    let s = chatReducer(asked(), {
      type: 'event',
      event: { type: 'tool_start', id: 't', name: 'x' },
    })
    s = chatReducer(s, { type: 'stop' })
    expect(s.phase).toBe('idle')
    expect(s.messages[1].status).toBe('stopped')
    expect(s.messages[1].steps[0].state).toBe('error')
  })
})

describe('toTurns and dropFailed', () => {
  it('sends answered history and drops failed answers with their question', () => {
    let s = asked()
    s = chatReducer(s, { type: 'event', event: { type: 'text', text: 'Yes.' } })
    s = chatReducer(s, { type: 'event', event: { type: 'done' } })
    s = chatReducer(s, { type: 'ask', id: 'u2', replyId: 'a2', content: 'And Spain?' })
    s = chatReducer(s, { type: 'fail', error: 'x' })
    expect(toTurns(s.messages, 'And Portugal?')).toEqual([
      { role: 'user', content: 'Is Greece burning?' },
      { role: 'assistant', content: 'Yes.' },
      { role: 'user', content: 'And Portugal?' },
    ])
    expect(dropFailed(s.messages).map((m) => m.id)).toEqual(['u1', 'a1'])
    expect(dropFailed(dropFailed(s.messages))).toHaveLength(2)
  })
})
