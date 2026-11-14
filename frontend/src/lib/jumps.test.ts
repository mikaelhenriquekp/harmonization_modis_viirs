import { describe, expect, it } from 'vitest'

import { sensorsFixture } from '@/test/fixtures'

import { jumps } from './jumps'

describe('jumps', () => {
  it('measures the step at the 2012 sensor switch', () => {
    // fixture: Aqua 120/yr, Suomi NPP 600/yr from 2012, harmonized 600/yr throughout;
    // January 2012 is still Aqua, so 2012 is 10 + 11 x 50 = 560
    const j = jumps(sensorsFixture())
    expect(j.unharmonized).toBeCloseTo((560 + 600 + 600) / 3 / 120)
    expect(j.harmonized).toBeCloseTo(1)
    expect(j.aquaOnly).toBeCloseTo(1)
  })

  it('is null without both sides of the switch', () => {
    const data = sensorsFixture()
    data.months = data.months.filter((m) => m.month >= '2012-01')
    expect(jumps(data).unharmonized).toBeNull()
  })
})
