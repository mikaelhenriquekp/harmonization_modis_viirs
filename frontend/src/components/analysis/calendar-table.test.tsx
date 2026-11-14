import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { calendarFixture } from '@/test/fixtures'

import { CalendarTable } from './calendar-table'

describe('CalendarTable', () => {
  it('is a table of years and months, newest year first, with totals and the mean', () => {
    render(<CalendarTable calendar={calendarFixture()} />)
    const rows = screen.getAllByRole('row')
    expect(within(rows[1]).getByRole('rowheader')).toHaveTextContent('2013')
    expect(within(rows.at(-1)!).getByRole('rowheader')).toHaveTextContent('Mean')
    expect(screen.getByRole('columnheader', { name: 'Total' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: /August 2012: 102 hotspots/ })).toHaveTextContent('102')
  })

  it('marks estimated months and the current month', () => {
    render(<CalendarTable calendar={calendarFixture()} />)
    expect(
      screen.getByRole('cell', { name: /June 2010.*estimated from MODIS/ }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('cell', { name: /March 2013.*so far.*current month/ }),
    ).toBeInTheDocument()
  })

  it('switches to anomalies', async () => {
    render(<CalendarTable calendar={calendarFixture()} />)
    await userEvent.click(screen.getByRole('radio', { name: /anomaly/i }))
    expect(screen.getByText('Far below')).toBeInTheDocument()
  })
})
