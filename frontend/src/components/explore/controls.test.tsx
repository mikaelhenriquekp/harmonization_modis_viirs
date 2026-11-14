import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { RegionSummary } from '@/api/types'
import { initialDrawing } from '@/lib/drawing'

import { DrawTools } from './draw-tools'
import { PeriodPicker } from './period-picker'
import { PlacePicker } from './place-picker'

describe('DrawTools', () => {
  it('starts each tool', async () => {
    const dispatch = vi.fn()
    render(<DrawTools drawing={initialDrawing} dispatch={dispatch} />)
    await userEvent.click(screen.getByRole('button', { name: /draw a shape/i }))
    expect(dispatch).toHaveBeenCalledWith({ type: 'start', tool: 'polygon' })
    await userEvent.click(screen.getByRole('button', { name: /rectangle/i }))
    expect(dispatch).toHaveBeenCalledWith({ type: 'start', tool: 'rectangle' })
    await userEvent.click(screen.getByRole('button', { name: /point/i }))
    expect(dispatch).toHaveBeenCalledWith({ type: 'start', tool: 'point' })
  })

  it('guides a polygon and only finishes it with three corners', async () => {
    const dispatch = vi.fn()
    const { rerender } = render(
      <DrawTools
        drawing={{
          ...initialDrawing,
          tool: 'polygon',
          points: [
            [1, 1],
            [1, 2],
          ],
        }}
        dispatch={dispatch}
      />,
    )
    expect(screen.getByText(/tap the map to add corners/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Finish shape' })).toBeDisabled()
    rerender(
      <DrawTools
        drawing={{
          ...initialDrawing,
          tool: 'polygon',
          points: [
            [1, 1],
            [1, 2],
            [2, 2],
          ],
        }}
        dispatch={dispatch}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Finish shape' }))
    expect(dispatch).toHaveBeenCalledWith({ type: 'finish' })
    await userEvent.click(screen.getByRole('button', { name: 'Undo corner' }))
    expect(dispatch).toHaveBeenCalledWith({ type: 'undo' })
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(dispatch).toHaveBeenCalledWith({ type: 'cancel' })
  })

  it('picks the radius of a point', async () => {
    const dispatch = vi.fn()
    render(<DrawTools drawing={{ ...initialDrawing, tool: 'point' }} dispatch={dispatch} />)
    await userEvent.selectOptions(screen.getByLabelText('Radius'), '10')
    expect(dispatch).toHaveBeenCalledWith({ type: 'radius', km: 10 })
  })
})

const regions: RegionSummary[] = [
  {
    id: 'South_Africa',
    name: 'South Africa',
    status: 'ok',
    pooled_with: [],
    warnings: [],
    bbox: [16, -35, 33, -22],
    centroid: [-28, 25],
  },
  {
    id: 'Antarctica',
    name: 'Antarctica',
    status: 'insufficient_data',
    pooled_with: [],
    warnings: [],
    bbox: null,
    centroid: null,
  },
]

describe('PlacePicker', () => {
  it('suggests places and countries', async () => {
    const onPick = vi.fn()
    render(<PlacePicker regions={regions} onPick={onPick} />)
    await userEvent.type(screen.getByRole('searchbox', { name: /find a place/i }), 'south')
    await userEvent.click(screen.getByRole('button', { name: /South Africa/ }))
    expect(onPick).toHaveBeenCalledWith(
      { kind: 'bbox', west: 16, south: -35, east: 33, north: -22 },
      'South Africa',
    )
  })

  it('lists the ready-made places without a query', async () => {
    const onPick = vi.fn()
    render(<PlacePicker regions={regions} onPick={onPick} />)
    await userEvent.click(screen.getByRole('button', { name: /Región de Murcia/ }))
    expect(onPick).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'bbox' }),
      'Región de Murcia',
    )
    expect(screen.queryByRole('button', { name: /Antarctica/ })).not.toBeInTheDocument()
  })
})

describe('PeriodPicker', () => {
  it('offers quick periods and custom years', async () => {
    const onChange = vi.fn()
    render(<PeriodPicker from={undefined} to={undefined} currentYear={2026} onChange={onChange} />)
    await userEvent.click(screen.getByRole('radio', { name: /since VIIRS/i }))
    expect(onChange).toHaveBeenCalledWith({ from: '2012-02', to: undefined })
    await userEvent.selectOptions(screen.getByLabelText('From'), '2015')
    expect(onChange).toHaveBeenCalledWith({ from: '2015-01', to: undefined })
    await userEvent.selectOptions(screen.getByLabelText('To'), '2020')
    expect(onChange).toHaveBeenCalledWith({ from: undefined, to: '2020-12' })
  })
})

describe('PlacePicker, compact', () => {
  it('opens a list on focus and picks with the keyboard', async () => {
    const onPick = vi.fn()
    render(<PlacePicker compact regions={[]} onPick={onPick} />)
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    const box = screen.getByRole('combobox', { name: /find a place or country/i })
    await userEvent.click(box)
    expect(screen.getByRole('listbox')).toBeInTheDocument()
    await userEvent.type(box, 'gree')
    await userEvent.keyboard('{Enter}')
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ kind: 'bbox' }), 'Greece')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('closes with Escape', async () => {
    render(<PlacePicker compact regions={[]} onPick={() => {}} />)
    await userEvent.click(screen.getByRole('combobox'))
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })
})
