import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { calendarFixture } from '@/test/fixtures'

import { MiniCalendar } from './mini-calendar'

describe('MiniCalendar', () => {
  it('picks a month for the map and lets go of it again', async () => {
    const onSelect = vi.fn()
    const { rerender } = render(
      <MiniCalendar calendar={calendarFixture()} selected={null} onSelect={onSelect} />,
    )
    const aug = screen.getByRole('button', { name: /August 2011: 101 hotspots/ })
    await userEvent.click(aug)
    expect(onSelect).toHaveBeenCalledWith('2011-08')

    rerender(<MiniCalendar calendar={calendarFixture()} selected="2011-08" onSelect={onSelect} />)
    const pressed = screen.getByRole('button', { name: /August 2011/ })
    expect(pressed).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(pressed)
    expect(onSelect).toHaveBeenLastCalledWith(null)
  })

  it('has no button for months outside the record', () => {
    render(<MiniCalendar calendar={calendarFixture()} selected={null} onSelect={() => {}} />)
    expect(screen.queryByRole('button', { name: /December 2013/ })).toBeNull()
  })
})
