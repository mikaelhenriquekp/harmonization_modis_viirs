import { describe, expect, it } from 'vitest'

import { calendarFixture } from '@/test/fixtures'

import {
  completeMonths,
  lastCompleteMonth,
  lastMonths,
  monthVsLastYear,
  peakShare,
  topYears,
  yearSoFar,
} from './insights'

describe('insights', () => {
  it('compares this month with the same month last year', () => {
    // fixture: March 2013 has 10 so far, March 2012 had 10
    expect(monthVsLastYear(calendarFixture())).toEqual({
      month: '2013-03',
      value: 10,
      previous: 10,
      changePct: 0,
      incomplete: true,
    })
  })

  it('sums the last three months against their usual total', () => {
    const r = lastMonths(calendarFixture(), 3)
    expect(r.months.map((m) => m.month)).toEqual(['2013-01', '2013-02', '2013-03'])
    expect(r.total).toBe(30)
    expect(r.usual).toBe(30) // medians 10 + 10 + 10
    expect(r.changePct).toBe(0)
  })

  it('finds the share of a typical year in its peak months', () => {
    const r = peakShare(calendarFixture(), 3)
    // medians: August 101, every other month 10 -> 101 + 10 + 10 of 211
    expect(r.months[0]).toBe(8)
    expect(r.share).toBeCloseTo((121 / 211) * 100)
  })

  it('compares this year so far with the mean of complete years over the same months', () => {
    const r = yearSoFar(calendarFixture())
    expect(r).toEqual({ year: 2013, value: 30, mean: 30, changePct: 0, months: 3 })
  })

  it('ranks the complete years', () => {
    expect(topYears(calendarFixture(), 2).map((y) => y.year)).toEqual([2012, 2011])
  })
})

describe('complete months', () => {
  it('leaves out the unfinished month, so it is not compared with whole ones', () => {
    const c = completeMonths(calendarFixture())
    expect(c.months.at(-1)?.month).toBe('2013-02')
    expect(monthVsLastYear(c)?.month).toBe('2013-02')
  })

  it('finds the last month the data covers in full', () => {
    expect(lastCompleteMonth('2026-11-14')).toBe('2026-10')
    expect(lastCompleteMonth('2026-10-31')).toBe('2026-10')
    expect(lastCompleteMonth('2026-01-03')).toBe('2025-12')
  })
})
