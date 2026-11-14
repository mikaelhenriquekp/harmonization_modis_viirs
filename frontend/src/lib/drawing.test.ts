import { describe, expect, it } from 'vitest'

import { drawingReducer, initialDrawing, type DrawingState } from './drawing'

function run(...actions: Parameters<typeof drawingReducer>[1][]): DrawingState {
  return actions.reduce(drawingReducer, initialDrawing)
}

describe('drawingReducer', () => {
  it('draws a rectangle from two taps in any order', () => {
    const s = run(
      { type: 'start', tool: 'rectangle' },
      { type: 'tap', lat: 39, lon: -1 },
      { type: 'tap', lat: 37, lon: -2 },
    )
    expect(s.done).toEqual({ kind: 'bbox', west: -2, south: 37, east: -1, north: 39 })
    expect(s.tool).toBeNull()
  })

  it('drops a point with the chosen radius', () => {
    const s = run(
      { type: 'start', tool: 'point' },
      { type: 'radius', km: 10 },
      { type: 'tap', lat: 38, lon: -1.1 },
    )
    expect(s.done).toEqual({ kind: 'point', lat: 38, lon: -1.1, radiusKm: 10 })
  })

  it('draws a polygon until it is finished', () => {
    let s = run(
      { type: 'start', tool: 'polygon' },
      { type: 'tap', lat: 37, lon: -2 },
      { type: 'tap', lat: 37, lon: -1 },
    )
    expect(s.done).toBeNull()
    s = drawingReducer(s, { type: 'finish' })
    expect(s.done).toBeNull() // two points are not a polygon
    s = drawingReducer(s, { type: 'tap', lat: 39, lon: -1 })
    s = drawingReducer(s, { type: 'finish' })
    expect(s.done).toEqual({
      kind: 'polygon',
      points: [
        [-2, 37],
        [-1, 37],
        [-1, 39],
      ],
    })
  })

  it('closes a polygon when the first vertex is tapped again', () => {
    const s = run(
      { type: 'start', tool: 'polygon' },
      { type: 'tap', lat: 37, lon: -2 },
      { type: 'tap', lat: 37, lon: -1 },
      { type: 'tap', lat: 39, lon: -1 },
      { type: 'closeOnFirst' },
    )
    expect(s.done?.kind).toBe('polygon')
  })

  it('undoes the last vertex and cancels', () => {
    let s = run(
      { type: 'start', tool: 'polygon' },
      { type: 'tap', lat: 37, lon: -2 },
      { type: 'tap', lat: 37, lon: -1 },
    )
    s = drawingReducer(s, { type: 'undo' })
    expect(s.points).toHaveLength(1)
    s = drawingReducer(s, { type: 'cancel' })
    expect(s).toMatchObject({ tool: null, points: [], done: null })
  })

  it('ignores taps when no tool is active', () => {
    expect(run({ type: 'tap', lat: 1, lon: 1 })).toEqual(initialDrawing)
  })
})
