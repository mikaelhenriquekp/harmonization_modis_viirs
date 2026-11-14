import { describe, expect, it } from 'vitest'

import { formatCount, formatMonth, formatSignedPct, monthName } from './format'

describe('format', () => {
  it('formats counts compactly but exactly when small', () => {
    expect(formatCount(0)).toBe('0')
    expect(formatCount(12.34)).toBe('12.3')
    expect(formatCount(1234.5)).toBe('1,235')
    expect(formatCount(2_345_678)).toBe('2.3M')
  })

  it('formats months', () => {
    expect(formatMonth('2017-07')).toBe('July 2017')
    expect(formatMonth('2017-07', 'short')).toBe('Jul 2017')
    expect(monthName(1)).toBe('January')
    expect(monthName(12, 'narrow')).toBe('D')
  })

  it('signs percentages', () => {
    expect(formatSignedPct(54.04)).toBe('+54%')
    expect(formatSignedPct(-100)).toBe('−100%')
    expect(formatSignedPct(0.2)).toBe('0%')
  })
})
