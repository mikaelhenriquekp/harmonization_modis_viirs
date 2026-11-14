import { afterEach, describe, expect, it, vi } from 'vitest'

import { createSseParser, streamChat } from './assistant'
import { ApiError } from './client'
import type { AssistantEvent } from './types'

function frames(...events: AssistantEvent[]): string {
  return events.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join('')
}

describe('createSseParser', () => {
  it('handles frames split across chunks and several frames in one chunk', () => {
    const got: AssistantEvent[] = []
    const parse = createSseParser((e) => got.push(e))
    const text = frames(
      { type: 'text', text: 'Hot ' },
      { type: 'text', text: 'summer' },
      { type: 'done' },
    )
    parse(text.slice(0, 17))
    expect(got).toEqual([])
    parse(text.slice(17, 60))
    parse(text.slice(60))
    expect(got).toEqual([
      { type: 'text', text: 'Hot ' },
      { type: 'text', text: 'summer' },
      { type: 'done' },
    ])
  })

  it('skips broken frames and comments, and accepts CRLF', () => {
    const got: AssistantEvent[] = []
    const parse = createSseParser((e) => got.push(e))
    parse(': keep-alive\r\n\r\ndata: {oops\r\n\r\ndata: {"type":"done"}\r\n\r\n')
    expect(got).toEqual([{ type: 'done' }])
  })
})

describe('streamChat', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('posts the conversation and streams the events', async () => {
    const body = frames({ type: 'tool_start', id: '1', name: 'get_calendar' }, { type: 'done' })
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } }),
      )
    vi.stubGlobal('fetch', fetchMock)
    const got: AssistantEvent[] = []
    await streamChat(
      { messages: [{ role: 'user', content: 'hi' }], context: { area: 'world' } },
      (e) => got.push(e),
    )
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/assistant/chat')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({
      messages: [{ role: 'user', content: 'hi' }],
      context: { area: 'world' },
    })
    expect(got.map((e) => e.type)).toEqual(['tool_start', 'done'])
  })

  it('throws the server message on errors, like the rate limit', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ error: 'Ember needs to cool down' }), { status: 429 }),
        ),
    )
    const err = await streamChat({ messages: [] }, () => {}).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect((err as ApiError).status).toBe(429)
    expect((err as ApiError).message).toBe('Ember needs to cool down')
  })
})
