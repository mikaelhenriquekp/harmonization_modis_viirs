import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { calendarFixture } from '@/test/fixtures'

import { MonthTimeline } from './month-timeline'

describe('MonthTimeline', () => {
  const { months } = calendarFixture()

  it('says which month the map shows', () => {
    render(<MonthTimeline months={months} value="2011-08" onChange={() => {}} />)
    const slider = screen.getByRole('slider', { name: /month shown on the map/i })
    expect(slider).toHaveAttribute('aria-valuetext', 'August 2011: 101 hotspots, +1% vs usual')
  })

  it('steps by month with the arrows and by year with page keys', async () => {
    const onChange = vi.fn()
    render(<MonthTimeline months={months} value="2011-08" onChange={onChange} />)
    screen.getByRole('slider').focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(onChange).toHaveBeenLastCalledWith('2011-09')
    await userEvent.keyboard('{PageDown}')
    expect(onChange).toHaveBeenLastCalledWith('2010-08')
    await userEvent.keyboard('{End}')
    expect(onChange).toHaveBeenLastCalledWith('2013-03')
  })

  it('stops at the ends of the record', async () => {
    const onChange = vi.fn()
    render(<MonthTimeline months={months} value="2013-03" onChange={onChange} />)
    expect(screen.getByRole('button', { name: 'Next month' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Previous month' }))
    expect(onChange).toHaveBeenCalledWith('2013-02')
  })
})
