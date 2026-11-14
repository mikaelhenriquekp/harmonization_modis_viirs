import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'

import { calendarResponseFixture } from '@/test/fixtures'

import { AreaNotes } from './area-notes'
import { CurrentStatus } from './current-status'
import { Downloads } from './downloads'

describe('CurrentStatus', () => {
  it('answers in one sentence and shows the numbers behind it', () => {
    render(<CurrentStatus data={calendarResponseFixture()} name="Región de Murcia" />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'March 2013 in Región de Murcia is far above normal',
    )
    expect(screen.getByText(/10 hotspots so far/)).toBeInTheDocument()
    expect(screen.getByText(/about 22.1 at this pace/)).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /worried|alarmed/i })).toBeInTheDocument()
  })

  it('says when there is nothing to compare with', () => {
    const data = calendarResponseFixture()
    data.calendar.current = {
      ...data.calendar.current!,
      status: 'no_history',
      median: null,
      years_compared: 0,
    }
    render(<CurrentStatus data={data} name="Nowhere" />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'without past years to compare with',
    )
  })
})

describe('Downloads', () => {
  it('links the calendar CSV of the area and period', () => {
    render(
      <Downloads area={{ kind: 'world' }} range={{ from: '2010-01' }} dataUntil="2026-11-14" />,
    )
    expect(screen.getByRole('link', { name: /monthly calendar/i })).toHaveAttribute(
      'href',
      '/api/calendar.csv?from=2010-01',
    )
  })

  it('links raw hotspots for the chosen days and refuses more than a year', async () => {
    render(
      <Downloads
        area={{ kind: 'point', lat: 38, lon: -1, radiusKm: 5 }}
        range={{}}
        dataUntil="2026-11-14"
      />,
    )
    const link = screen.getByRole('link', { name: /raw hotspots/i })
    expect(decodeURIComponent(link.getAttribute('href')!)).toBe(
      '/api/hotspots.csv?lat=38&lon=-1&radius_km=5&from=2026-10-16&to=2026-11-14',
    )
    const from = screen.getByLabelText('First day')
    await userEvent.clear(from)
    await userEvent.type(from, '2024-01-01')
    expect(screen.getByText(/at most 366 days/)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /raw hotspots/i })).not.toBeInTheDocument()
  })
})

describe('AreaNotes', () => {
  it('lists the caveats and the countries behind the numbers', () => {
    render(
      <MemoryRouter>
        <AreaNotes data={calendarResponseFixture()} />
      </MemoryRouter>,
    )
    expect(screen.getByText(/estimate/)).toBeInTheDocument()
    expect(screen.getByText('Spain')).toBeInTheDocument()
  })
})
