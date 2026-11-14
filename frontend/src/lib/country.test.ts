import { describe, expect, it } from 'vitest'

import { countryAt, decimate } from './country'

describe('countryAt', () => {
  it.each([
    ['Madrid', 40.42, -3.7, 'Spain'],
    ['Granada, southern Spain', 37.18, -3.6, 'Spain'],
    ['Murcia', 37.99, -1.13, 'Spain'],
    ['Lisbon', 38.72, -9.14, 'Portugal'],
    ['Amsterdam', 52.37, 4.9, 'Netherlands'],
    ['Algiers', 36.7, 3.06, 'Algeria'],
    ['Santiago de Chile', -33.45, -70.67, 'Chile'],
  ])('finds %s inside its own borders', async (_, lat, lon, name) => {
    expect((await countryAt(lat, lon))?.name).toBe(name)
  })

  it('answers nothing at sea', async () => {
    expect(await countryAt(36.0, -20.0)).toBeNull()
  })

  it('gives the landmass under the point as a polygon the API accepts', async () => {
    const spain = await countryAt(40.42, -3.7)
    expect(spain?.outline?.kind).toBe('polygon')
    if (spain?.outline?.kind !== 'polygon') return
    expect(spain.outline.points.length).toBeLessThanOrEqual(200)
    // mainland Spain, not the Canary Islands
    expect(Math.min(...spain.outline.points.map((p) => p[1]))).toBeGreaterThan(35)
  })
})

describe('decimate', () => {
  it('drops the closing point and keeps at most the asked corners', () => {
    const ring = Array.from({ length: 1001 }, (_, i) => [i % 1000, 0])
    const out = decimate(ring, 100)
    expect(out.length).toBeLessThanOrEqual(100)
    expect(out[0]).toEqual([0, 0])
  })
})
