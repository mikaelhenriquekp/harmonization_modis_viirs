import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { calendarFixture } from '@/test/fixtures'

import { BurningCalendar } from './burning-calendar'

describe('BurningCalendar', () => {
  it('has a cell for every month of the range, each described in words', () => {
    render(<BurningCalendar calendar={calendarFixture()} />)
    expect(screen.getAllByRole('gridcell')).toHaveLength(39)
    expect(screen.getByRole('gridcell', { name: /August 2012: 102 hotspots/ })).toBeInTheDocument()
    expect(
      screen.getByRole('gridcell', { name: /June 2010: 10 hotspots.*estimated/ }),
    ).toBeInTheDocument()
    expect(screen.getByRole('gridcell', { name: /March 2013.*so far/ })).toBeInTheDocument()
  })

  it('labels the years and months', () => {
    render(<BurningCalendar calendar={calendarFixture()} />)
    expect(screen.getByRole('rowheader', { name: '2011' })).toBeInTheDocument()
    expect(screen.getAllByRole('columnheader')).toHaveLength(12)
  })

  it('shows the values as a table', async () => {
    render(<BurningCalendar calendar={calendarFixture()} />)
    await userEvent.click(screen.getByRole('button', { name: 'View as table' }))
    const table = screen.getByRole('table', { name: /hotspots per month/i })
    expect(table).toBeInTheDocument()
    expect(screen.getAllByRole('row')).toHaveLength(5)
  })

  it('has a legend with the class breaks', () => {
    render(<BurningCalendar calendar={calendarFixture()} />)
    expect(screen.getByText('No hotspots')).toBeInTheDocument()
    expect(screen.getByText('> 50')).toBeInTheDocument()
  })
})
