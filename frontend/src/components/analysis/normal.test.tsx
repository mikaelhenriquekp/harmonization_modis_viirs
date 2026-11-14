import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { calendarFixture } from '@/test/fixtures'

import { NormalChart } from './normal-chart'
import { YearsRanking } from './years-ranking'

describe('NormalChart', () => {
  it('names the verdict and draws the chosen year over the usual range', async () => {
    render(<NormalChart calendar={calendarFixture()} />)
    expect(
      screen.getByRole('heading', { name: /March 2013 far above normal/i }),
    ).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /usual range.*2013/i })).toBeInTheDocument()
    await userEvent.selectOptions(screen.getByLabelText('Year'), '2012')
    expect(screen.getByRole('img', { name: /2012/ })).toBeInTheDocument()
  })
})

describe('YearsRanking', () => {
  it('lists the busiest years with their totals, the current year highlighted', () => {
    render(<YearsRanking calendar={calendarFixture()} />)
    const items = within(screen.getByRole('list', { name: /most active years/i })).getAllByRole(
      'listitem',
    )
    expect(items[0]).toHaveTextContent('1st')
    expect(items[0]).toHaveTextContent('2012')
    expect(items[0]).toHaveTextContent('212')
  })
})
