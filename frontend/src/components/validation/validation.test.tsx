import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { RegionDetail, RegionSummary } from '@/api/types'

import { JumpTiles } from './jump-tiles'
import { RegionExam } from './region-exam'
import { RegionsTable } from './regions-table'

const regions: RegionSummary[] = [
  {
    id: 'Spain',
    name: 'Spain',
    status: 'ok',
    scope: 'own',
    model: 'C',
    model_name: 'log-log regression',
    quality: 'good',
    pooled_with: [],
    warnings: [],
    bbox: null,
    centroid: null,
  },
  {
    id: 'Germany',
    name: 'Germany',
    status: 'ok',
    scope: 'own',
    model: 'A',
    quality: 'review',
    pooled_with: [],
    warnings: ['The best model has a -29.5 % bias'],
    bbox: null,
    centroid: null,
  },
  {
    id: 'Andorra',
    name: 'Andorra',
    status: 'ok',
    scope: 'regional',
    model: 'C',
    quality: 'review',
    pooled_with: ['Spain'],
    warnings: [],
    bbox: null,
    centroid: null,
  },
  {
    id: 'Antarctica',
    name: 'Antarctica',
    status: 'insufficient_data',
    pooled_with: [],
    warnings: [],
    bbox: null,
    centroid: null,
    reason: 'Aqua detected 0 hotspots',
  },
]

describe('JumpTiles', () => {
  it('shows the step before and after harmonizing next to Aqua alone', () => {
    render(<JumpTiles jumps={{ unharmonized: 5.87, harmonized: 0.99, aquaOnly: 1.0 }} />)
    expect(screen.getByText('×5.87')).toBeInTheDocument()
    expect(screen.getByText('×0.99')).toBeInTheDocument()
    expect(screen.getByText('×1.00')).toBeInTheDocument()
  })
})

describe('RegionsTable', () => {
  it('counts and filters the countries', async () => {
    const onSelect = vi.fn()
    render(<RegionsTable regions={regions} selected={undefined} onSelect={onSelect} />)
    expect(screen.getAllByRole('row')).toHaveLength(5)
    await userEvent.click(screen.getByRole('radio', { name: /to review \(2\)/i }))
    expect(screen.getAllByRole('row')).toHaveLength(3)
    await userEvent.click(screen.getByRole('radio', { name: /all/i }))
    await userEvent.type(screen.getByRole('searchbox'), 'antar')
    const rows = screen.getAllByRole('row')
    expect(rows).toHaveLength(2)
    await userEvent.click(within(rows[1]).getByRole('button', { name: 'Antarctica' }))
    expect(onSelect).toHaveBeenCalledWith('Antarctica')
  })
})

const detail: RegionDetail = {
  ...regions[0],
  train_hotspots: 10573,
  exam_hotspots: 4200,
  exam_bias_pct: -9.3,
  exam_r2: 0.87,
  exam: [
    {
      model: 'A',
      name: 'constant ratio',
      bias_pct: -10.5,
      zone_month_error: 4.3,
      spearman_cell: 0.3,
      r2_monthly_total: 0.86,
      monthly_total_error: 80,
    },
    {
      model: 'C',
      name: 'log-log regression',
      bias_pct: -9.3,
      zone_month_error: 4.1,
      spearman_cell: 0.3,
      r2_monthly_total: 0.87,
      monthly_total_error: 78,
    },
    {
      model: 'raw',
      name: 'unharmonized (MODIS as is)',
      bias_pct: -83,
      zone_month_error: 20,
      spearman_cell: 0.3,
      r2_monthly_total: -1.2,
      monthly_total_error: 500,
    },
  ],
  energy_exam: null,
  jumps: { unharmonized: 5.87, harmonized: 0.99, aqua_only: 1.0 },
  handover_noaa20_over_snpp: 1.023,
  periods: {
    learn: ['2012-02', '2017-12'],
    exam: ['2018-01', '2021-06'],
    reconstructed: ['2002-07', '2012-01'],
  },
}

describe('RegionExam', () => {
  it('shows every model graded, the chosen one marked, and the checks', () => {
    render(<RegionExam region={detail} />)
    const chosen = screen.getByRole('row', { name: /log-log regression/i })
    expect(within(chosen).getByText(/chosen/i)).toBeInTheDocument()
    expect(screen.getByRole('row', { name: /MODIS as is/i })).toBeInTheDocument()
    expect(screen.getByText(/1.023/)).toBeInTheDocument()
    expect(screen.getByText(/learned on 2012-02 to 2017-12/i)).toBeInTheDocument()
  })

  it('explains a pooled country', () => {
    render(<RegionExam region={{ ...detail, ...regions[2] }} />)
    expect(screen.getByText(/shares one with Spain/i)).toBeInTheDocument()
  })

  it('explains a country without a model', () => {
    render(<RegionExam region={{ ...detail, ...regions[3], exam: null, jumps: null }} />)
    expect(screen.getByText(/Aqua detected 0 hotspots/)).toBeInTheDocument()
  })
})
