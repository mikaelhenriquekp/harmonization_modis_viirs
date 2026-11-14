import { describe, expect, it } from 'vitest'

import { heatColor, heatSteps } from './heat'

describe('heat', () => {
  it('maps zero to the empty step and spreads classes over the ramp', () => {
    expect(heatColor(0, 7)).toBe('var(--heat-0)')
    expect(heatColor(1, 7)).toBe('var(--heat-1)')
    expect(heatColor(7, 7)).toBe('var(--heat-7)')
    expect(heatSteps(3)).toEqual([1, 4, 7])
    expect(heatColor(2, 3)).toBe('var(--heat-4)')
    expect(heatColor(1, 1)).toBe('var(--heat-4)')
  })

  it('has no color outside the range', () => {
    expect(heatColor(-1, 7)).toBe('transparent')
  })
})
