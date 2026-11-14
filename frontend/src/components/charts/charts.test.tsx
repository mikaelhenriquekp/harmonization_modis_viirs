import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { sensorsFixture } from '@/test/fixtures'

import { SensorsChart } from './sensors-chart'

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
