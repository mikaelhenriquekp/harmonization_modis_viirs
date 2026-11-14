import { describe, expect, it } from 'vitest'

import { anomalyClass, heatColor, heatFor, heatInk, heatSteps } from './heat'

describe('heat', () => {
  it('maps zero to the empty step and spreads classes over the six fire steps', () => {
    expect(heatColor(0, 7)).toBe('var(--heat-0)')
    expect(heatColor(1, 6)).toBe('var(--heat-1)')
    expect(heatColor(6, 6)).toBe('var(--heat-6)')
    expect(heatSteps(3)).toEqual([1, 4, 6])
    expect(heatColor(1, 1)).toBe('var(--heat-4)')
    expect(heatColor(-1, 7)).toBe('transparent')
  })

  it('picks the ink of each half of the ramp', () => {
    expect(heatInk(6, 6)).toBe('var(--heat-ink-hi)')
    expect(heatInk(1, 6)).toBe('var(--heat-ink-lo)')
    expect(heatInk(0, 6)).toBe('var(--bone)')
  })

  it('classifies a month against the same month of other years', () => {
    expect(anomalyClass(0.95)).toBe('much_above')
    expect(anomalyClass(0.8)).toBe('above')
    expect(anomalyClass(0.5)).toBe('normal')
    expect(anomalyClass(0.2)).toBe('below')
    expect(anomalyClass(0.05)).toBe('much_below')
    expect(anomalyClass(null)).toBe('no_history')
  })
})

describe('heatFor', () => {
  it('only uses the six steps that exist', () => {
    expect(heatFor(1000, 1000)).toBe('var(--heat-6)')
    expect(heatFor(1, 1000)).toBe('var(--heat-1)')
    expect(heatFor(0, 1000)).toBe('var(--heat-1)')
  })
})
