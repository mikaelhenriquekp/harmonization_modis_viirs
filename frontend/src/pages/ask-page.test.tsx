import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { AssistantEvent, ChatRequest } from '@/api/types'

const api = vi.hoisted(() => ({
  getAssistantStatus: vi.fn(),
  streamChat: vi.fn(),
}))
vi.mock('@/api/assistant', () => api)

import { AskPage } from './ask-page'

function renderAt(url: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createMemoryRouter([{ path: '/ask', element: <AskPage /> }], {
    initialEntries: [url],
  })
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

function answerWith(events: AssistantEvent[]) {
  api.streamChat.mockImplementation(
    async (_: ChatRequest, onEvent: (e: AssistantEvent) => void) => {
      for (const e of events) onEvent(e)
    },
  )
}

describe('AskPage', () => {
  beforeEach(() => {
    // the ember field is decoration; jsdom has no canvas
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    api.getAssistantStatus.mockResolvedValue({ enabled: true, model: 'm' })
    api.streamChat.mockReset()
  })

  it('says when Ember is not configured and does not let you ask', async () => {
    api.getAssistantStatus.mockResolvedValue({ enabled: false })
    renderAt('/ask')
    expect(await screen.findByText(/ember is resting/i)).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: /ask ember/i })).toBeDisabled()
  })

  it('asks a suggestion and shows tools, cards and the answer', async () => {
    answerWith([
      { type: 'tool_start', id: '1', name: 'get_anomalies', args: { area: { kind: 'world' } } },
      {
        type: 'tool_end',
        id: '1',
        name: 'get_anomalies',
        ok: true,
        elapsed_ms: 300,
        card: {
          kind: 'anomalies',
          title: 'World',
          data: { month: '2026-11', data_until: '2026-11-14', counts: { much_above: 2 }, top: [] },
        },
      },
      { type: 'text', text: 'Fire is **far above normal** in Australia.' },
      { type: 'done' },
    ])
    renderAt('/ask')
    const chip = await screen.findByRole('button', { name: /where is fire unusual right now/i })
    await waitFor(() => expect(chip).toBeEnabled())
    await userEvent.click(chip)

    expect(await screen.findByText('far above normal')).toBeInTheDocument()
    expect(screen.getByText('Anomaly scan')).toBeInTheDocument()
    expect(screen.getByText(/unusual fire · nov 2026/i)).toBeInTheDocument()
    const req = api.streamChat.mock.calls[0][0] as ChatRequest
    expect(req.messages.at(-1)?.content).toMatch(/most unusual right now/)
  })

  it('sends the page context and auto-asks a ?q= question', async () => {
    answerWith([{ type: 'text', text: 'Quiet year.' }, { type: 'done' }])
    renderAt('/ask?area=bbox:-9.6,35.9,4.4,43.9&name=Iberia&from=2020-01&q=How%20is%20it%3F')
    expect(await screen.findByText('Quiet year.')).toBeInTheDocument()
    const req = api.streamChat.mock.calls[0][0] as ChatRequest
    expect(req.context).toEqual({
      area: 'bbox:-9.6,35.9,4.4,43.9',
      name: 'Iberia',
      from: '2020-01',
    })
    expect(req.messages).toEqual([{ role: 'user', content: 'How is it?' }])
    expect(screen.getByText(/about: iberia/i)).toBeInTheDocument()
  })

  it('shows a failure with a way to try again', async () => {
    api.streamChat.mockRejectedValueOnce(new Error('Ember needs to cool down'))
    renderAt('/ask')
    const box = await screen.findByRole('textbox', { name: /ask ember/i })
    await waitFor(() => expect(box).toBeEnabled())
    await userEvent.type(box, 'Is Chile burning?{Enter}')
    expect(await screen.findByText('Ember needs to cool down')).toBeInTheDocument()

    answerWith([{ type: 'text', text: 'Below normal.' }, { type: 'done' }])
    await userEvent.click(screen.getByRole('button', { name: /try again/i }))
    expect(await screen.findByText('Below normal.')).toBeInTheDocument()
    expect(screen.queryByText('Ember needs to cool down')).not.toBeInTheDocument()
    expect(screen.getAllByText('Is Chile burning?')).toHaveLength(1)
  })
})
