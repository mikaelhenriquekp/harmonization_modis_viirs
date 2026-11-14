import { describe, expect, it } from 'vitest'

import { WORLD } from './area'
import { autoResolution, cellCount, dataArea, fitResolution } from './viewport'

describe('viewport', () => {
  it('picks a finer grid as the map zooms in', () => {
    expect(autoResolution(2)).toBe(1)
    expect(autoResolution(4)).toBe(0.5)
    expect(autoResolution(8)).toBe(0.25)
  })

  it('widens the view to a coarse grid so small pans reuse a request', () => {
    const a = dataArea({ west: -9.3, south: 36.1, east: 3.2, north: 43.7, zoom: 6 })
    const b = dataArea({ west: -8.1, south: 36.4, east: 4.1, north: 44.2, zoom: 6 })
    expect(a).toEqual({ kind: 'bbox', west: -10, south: 35, east: 5, north: 45 })
    expect(b).toEqual(a)
  })

  it('asks for the whole world when the view is that wide or crosses the antimeridian', () => {
    expect(dataArea({ west: -170, south: -60, east: 170, north: 80, zoom: 2 })).toEqual(WORLD)
    expect(dataArea({ west: 170, south: -20, east: 190, north: 0, zoom: 6 })).toEqual(WORLD)
  })

  it('counts the cells of an area', () => {
    expect(cellCount({ kind: 'bbox', west: 0, south: 0, east: 10, north: 5 }, 0.5)).toBe(200)
  })

  it('makes the grid coarser until it fits, and keeps the world at 1° or more', () => {
    const iberia = { kind: 'bbox' as const, west: -10, south: 35, east: 5, north: 45 }
    expect(fitResolution(iberia, 'auto', 7)).toBe(0.25)
    expect(fitResolution(iberia, 2, 7)).toBe(2)
    const africa = { kind: 'bbox' as const, west: -20, south: -40, east: 60, north: 40 }
    expect(fitResolution(africa, 0.25, 4)).toBe(0.5)
    expect(fitResolution(WORLD, 0.25, 2)).toBe(1)
  })
})
