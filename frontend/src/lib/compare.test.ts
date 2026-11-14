import { describe, expect, it } from 'vitest'

import { calendarFixture } from '@/test/fixtures'

import { changePct, defaultPeriods, periodRange, periodTotal } from './compare'

describe('compare', () => {
  it('covers one month or a whole year', () => {
    expect(periodRange('2017-08', 'month')).toEqual({ from: '2017-08', to: '2017-08' })
    expect(periodRange('2017', 'year')).toEqual({ from: '2017-01', to: '2017-12' })
  })

  it('adds up a period and flags estimated and incomplete ones', () => {
    const c = calendarFixture()
    expect(periodTotal(c, '2011', 'year')).toMatchObject({ hotspots: 211, estimated: true })
    expect(periodTotal(c, '2012-08', 'month')).toMatchObject({ hotspots: 102, estimated: false })
    expect(periodTotal(c, '2013', 'year').incomplete).toBe(true)
  })

  it('starts ten years apart', () => {
    expect(defaultPeriods('2026-11-10', 'month')).toEqual({ a: '2016-11', b: '2026-11' })
    expect(defaultPeriods('2026-11-10', 'year')).toEqual({ a: '2015', b: '2025' })
  })

  it('compares B with A', () => {
    expect(changePct(100, 150)).toBe(50)
    expect(changePct(0, 10)).toBeNull()
  })
})
