import { describe, expect, it } from 'vitest'

import { areaBounds, areaToParams, areaToSearch, parseAreaSearch, type Area } from './area'

const murcia: Area = { kind: 'bbox', west: -2.35, south: 37.37, east: -0.65, north: 38.76 }
const triangle: Area = {
  kind: 'polygon',
  points: [
    [-2, 37],
    [-1, 37],
    [-1, 39],
  ],
}

describe('areaToParams', () => {
  it.each<[Area, Record<string, string>]>([
    [{ kind: 'world' }, {}],
    [murcia, { bbox: '-2.35,37.37,-0.65,38.76' }],
    [
      { kind: 'point', lat: 38, lon: -1.13, radiusKm: 10 },
      { lat: '38', lon: '-1.13', radius_km: '10' },
    ],
    [triangle, { polygon: '-2,37,-1,37,-1,39' }],
  ])('maps %o to API parameters', (area, want) => {
    expect(areaToParams(area)).toEqual(want)
  })

  it('rounds coordinates to 4 decimals (about 10 m)', () => {
    expect(
      areaToParams({ kind: 'point', lat: 38.123456789, lon: -1.987654321, radiusKm: 25 }),
    ).toEqual({
      lat: '38.1235',
      lon: '-1.9877',
      radius_km: '25',
    })
  })
})

describe('area URL state', () => {
  it.each<Area>([
    { kind: 'world' },
    murcia,
    { kind: 'point', lat: 38, lon: -1.13, radiusKm: 10 },
    triangle,
  ])('round trips %o', (area) => {
    expect(parseAreaSearch(areaToSearch(area))).toEqual(area)
  })

  it.each(['', 'bbox:1,2,3', 'polygon:1,2,3,4', 'point:x,1,2', 'hexagon:1', 'bbox:-2,40,-1,39'])(
    'rejects %j',
    (s) => {
      expect(parseAreaSearch(s)).toBeNull()
    },
  )
})

describe('areaBounds', () => {
  it('gives south-west and north-east corners', () => {
    expect(areaBounds(murcia)).toEqual([
      [37.37, -2.35],
      [38.76, -0.65],
    ])
    expect(areaBounds(triangle)).toEqual([
      [37, -2],
      [39, -1],
    ])
    expect(areaBounds({ kind: 'world' })).toBeNull()
  })

  it('pads a point by its radius', () => {
    const b = areaBounds({ kind: 'point', lat: 0, lon: 0, radiusKm: 111.32 })!
    expect(b[0][0]).toBeCloseTo(-1)
    expect(b[1][1]).toBeCloseTo(1)
  })
})
