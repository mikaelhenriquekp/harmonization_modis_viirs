import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { calendarResponseFixture, sensorsFixture } from '@/test/fixtures'

import { Guide } from './guide'

function mount() {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) =>
      Promise.resolve(
        new Response(
          JSON.stringify(url.includes('/sensors') ? sensorsFixture() : calendarResponseFixture()),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    ),
  )
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={['/?area=world&name=Murcia']}>
        <Guide />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('Guide', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('opens, answers from the data and says it is not generative', async () => {
    mount()
    await userEvent.click(screen.getByRole('button', { name: /ask paparajote/i }))
    expect(screen.getByText(/No generative AI/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'When does it burn here?' }))
    expect(await screen.findByText(/In Murcia the usual peak is August/)).toBeInTheDocument()
  })
})
