import { describe, expect, it } from 'vitest'

import { detailDays, footprint, frpColor, parseDetections } from './detections'

const res = {
  from: '2025-08-01',
  to: '2025-08-07',
  count: 2,
  columns: [
    'latitude',
    'longitude',
    'acq_date',
    'acq_time',
    'satellite',
    'confidence',
    'frp',
    'scan',
    'track',
    'daynight',
    'type',
    'provisional',
    'source',
  ],
  rows: [
    [38.0, -1.2, '2025-08-03', 135, 'N20', 'n', 12.5, 0.4, 0.38, 'D', 0, false, 'VIIRS_NOAA20_SP'],
    [38.1, -1.3, '2025-08-03', '0212', 'Aqua', '80', null, 1.1, 1.0, 'N', 0, true, 'MODIS_NRT'],
  ],
  attribution: '',
}

describe('detections', () => {
  it('reads the rows by column name', () => {
    const [a, b] = parseDetections(res)
    expect(a).toMatchObject({ lat: 38, time: '0135', satellite: 'N20', frp: 12.5, pass: 'D' })
    expect(b).toMatchObject({ frp: null, pass: 'N', provisional: true, scanKm: 1.1 })
  })

  it('draws the pixel at its real size', () => {
    const [[s, w], [n, e]] = footprint(parseDetections(res)[0])
    expect((n - s) * 111.32).toBeCloseTo(0.38, 2)
    expect((e - w) * 111.32 * Math.cos((38 * Math.PI) / 180)).toBeCloseTo(0.4, 2)
  })

  it('colours by radiative power', () => {
    expect(frpColor(2)).toBe('var(--heat-3)')
    expect(frpColor(500)).toBe('var(--heat-6)')
    expect(frpColor(null)).toBe('var(--slate)')
  })

  it('asks for a whole month, or the last week of data', () => {
    expect(detailDays('2017-02', '2025-11-10')).toEqual({ from: '2017-02-01', to: '2017-02-28' })
    expect(detailDays('2025-11', '2025-11-10')).toEqual({ from: '2025-11-01', to: '2025-11-10' })
    expect(detailDays(null, '2025-11-10')).toEqual({ from: '2025-11-04', to: '2025-11-10' })
  })
})
