import { describe, expect, it } from 'vitest'

import { anomalyClass, heatColor, heatInk, heatSteps, MAP_STEPS, mapBreaks, mapStep } from './heat'

describe('heat', () => {
  it('maps zero to the empty step and spreads classes over the six fire steps', () => {
    expect(heatColor(0, 7)).toBe('var(--heat-0)')
    expect(heatColor(1, 6)).toBe('var(--heat-1)')
    expect(heatColor(6, 6)).toBe('var(--heat-6)')
    expect(heatSteps(3)).toEqual([1, 4, 6])
    expect(heatColor(1, 1)).toBe('var(--heat-4)')
    expect(heatColor(-1, 7)).toBe('transparent')
  })

  it('writes dark numbers on bright cells and light numbers on dark ones', () => {
    expect(heatInk(6, 6)).toBe('var(--on-accent)')
    expect(heatInk(1, 6)).toBe('var(--bone)')
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

describe('mapStep', () => {
  it('spreads cells over the steps that read on a dark map', () => {
    expect(mapStep(0, 1000)).toBe(2)
    expect(mapStep(1, 1000)).toBe(2)
    expect(mapStep(1000, 1000)).toBe(6)
    // a log scale: 30 of 1000 is already halfway
    expect(mapStep(30, 1000)).toBe(4)
    expect(mapStep(5, 0)).toBe(2)
  })

  it('puts each legend break where its step starts', () => {
    const breaks = mapBreaks(1000)
    expect(breaks[0]).toBe(0)
    breaks.forEach((b, i) => expect(mapStep(b * 1.0001 + 0.0001, 1000)).toBe(MAP_STEPS[i]))
  })
})
