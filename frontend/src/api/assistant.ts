import { API_BASE_URL, ApiError, api } from './client'
import type { AssistantEvent, AssistantStatus, ChatRequest } from './types'

export function getAssistantStatus(signal?: AbortSignal) {
  return api.get<AssistantStatus>('/assistant/status', { signal })
}

/**
 * Splits a server-sent event stream into events. Feed it text as it arrives;
 * it keeps an incomplete frame until the rest comes.
 */
export function createSseParser(onEvent: (e: AssistantEvent) => void) {
  let buffer = ''
  return (chunk: string) => {
    buffer += chunk.replace(/\r\n/g, '\n')
    let end: number
    while ((end = buffer.indexOf('\n\n')) >= 0) {
      const frame = buffer.slice(0, end)
      buffer = buffer.slice(end + 2)
      const data = frame
        .split('\n')
        .filter((l) => l.startsWith('data:'))
        .map((l) => l.slice(5).trimStart())
        .join('\n')
      if (!data) continue
      try {
        onEvent(JSON.parse(data) as AssistantEvent)
      } catch {
        // a broken frame is skipped, the rest of the answer still arrives
      }
    }
  }
}

/** Asks Ember; events arrive through onEvent until the promise resolves. */
export async function streamChat(
  body: ChatRequest,
  onEvent: (e: AssistantEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/assistant/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify(body),
    signal,
  })
  if (!res.ok || !res.body) {
    const data: unknown = await res.json().catch(() => undefined)
    const message =
      data && typeof data === 'object' && 'error' in data && typeof data.error === 'string'
        ? data.error
        : `Request failed with status ${res.status}`
    throw new ApiError(res.status, message, data)
  }
  const parse = createSseParser(onEvent)
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    parse(value)
  }
}
