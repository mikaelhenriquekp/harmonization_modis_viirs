import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { HealthStatus } from './health-status'

describe('HealthStatus', () => {
  it('renders the greeting and statuses from the report', () => {
    render(
      <HealthStatus
        data={{ status: 'ok', database: 'ok', migration_version: 1, greeting: 'Hello, world!' }}
        isLoading={false}
        error={null}
        onRefresh={() => {}}
      />,
    )

    expect(screen.getByText('Hello, world!')).toBeInTheDocument()
    expect(screen.getAllByText('ok')).toHaveLength(2)
    expect(screen.getByText('v1')).toBeInTheDocument()
  })

  it('shows an error when the backend is unreachable', () => {
    render(
      <HealthStatus isLoading={false} error={new Error('Network down')} onRefresh={() => {}} />,
    )

    expect(screen.getByRole('alert')).toHaveTextContent('Network down')
  })

  it('calls onRefresh when the refresh button is clicked', async () => {
    const onRefresh = vi.fn()
    render(<HealthStatus isLoading error={null} onRefresh={onRefresh} />)

    await userEvent.click(screen.getByRole('button', { name: /refresh/i }))

    expect(onRefresh).toHaveBeenCalledOnce()
  })
})
