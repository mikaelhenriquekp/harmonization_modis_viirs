import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { calendarFixture, sensorsFixture } from '@/test/fixtures'

import { SeasonChart } from './season-chart'
import { SensorsChart } from './sensors-chart'
import { YearsChart } from './years-chart'

describe('SeasonChart', () => {
  it('compares a year with the usual range of every month', () => {
    render(<SeasonChart calendar={calendarFixture()} />)
    expect(
      screen.getByRole('img', { name: /typical range of each month.*2013/i }),
    ).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: '2013' })).toBeChecked()
  })

  it('lets the reader pick another year', async () => {
    render(<SeasonChart calendar={calendarFixture()} />)
    await userEvent.click(screen.getByRole('radio', { name: '2012' }))
    expect(screen.getByRole('img', { name: /2012/ })).toBeInTheDocument()
  })

  it('describes the hovered month', async () => {
    render(<SeasonChart calendar={calendarFixture()} />)
    await userEvent.click(screen.getByRole('radio', { name: '2012' }))
    fireEvent.focus(screen.getAllByTestId('season-hit')[7])
    expect(
      screen.getByText(
        (_, el) => el?.tagName === 'P' && !!el.textContent?.includes('August: 102 in 2012'),
      ),
    ).toBeInTheDocument()
  })
})

describe('YearsChart', () => {
  it('ranks the complete years', () => {
    render(<YearsChart calendar={calendarFixture()} />)
    const chart = screen.getByRole('img', { name: /hotspots per year/i })
    expect(within(chart).getByText('#1')).toBeInTheDocument()
    expect(screen.getByText(/so far/)).toBeInTheDocument()
  })
})

describe('SensorsChart', () => {
  it('draws the raw sensors and the harmonized series with direct labels', () => {
    render(<SensorsChart data={sensorsFixture()} />)
    const chart = screen.getByRole('img', { name: /per year/i })
    for (const label of ['Harmonized', 'MODIS Aqua', 'Suomi NPP']) {
      expect(within(chart).getAllByText(label).length).toBeGreaterThan(0)
    }
  })

  it('has a table view', async () => {
    render(<SensorsChart data={sensorsFixture()} />)
    await userEvent.click(screen.getByRole('button', { name: 'View as table' }))
    expect(screen.getAllByRole('row')).toHaveLength(7)
  })
})
