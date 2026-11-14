import { describe, expect, it } from 'vitest'

import { monthSpanDays, slug } from './export'

describe('export helpers', () => {
  it('turns months into whole days', () => {
    expect(monthSpanDays('2024-02', '2024-02')).toEqual({
      from: '2024-02-01',
      to: '2024-02-29',
      days: 29,
    })
    expect(monthSpanDays('2025-01', '2025-12', '2025-11-10')).toMatchObject({
      to: '2025-11-10',
      days: 314,
    })
  })

  it('names files after the place', () => {
    expect(slug('Región de Murcia')).toBe('region-de-murcia')
    expect(slug('···')).toBe('area')
  })
})
