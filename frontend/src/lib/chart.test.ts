import { describe, expect, it } from 'vitest'

import { niceMax, spreadLabels } from './chart'

describe('chart helpers', () => {
  it('rounds the axis up', () => {
    expect(niceMax(774)).toBe(1000)
    expect(niceMax(212)).toBe(250)
    expect(niceMax(0)).toBe(1)
  })

  it('spreads colliding labels and keeps the rest', () => {
    expect(spreadLabels([100, 104, 200], 12)).toEqual([100, 112, 200])
    expect(spreadLabels([104, 100], 12)).toEqual([112, 100])
  })
})
