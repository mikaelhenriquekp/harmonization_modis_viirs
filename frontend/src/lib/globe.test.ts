import { describe, expect, it } from 'vitest'

import { clampZoom, makeProjection, pointAt, visible } from './globe'

describe('globe geometry', () => {
  const p = makeProjection(400, [5, -30])

  it('puts the rotation center in the middle', () => {
    const [x, y] = p([-5, 30])!
    expect(x).toBeCloseTo(200)
    expect(y).toBeCloseTo(200)
  })

  it('knows which side of the globe a place is on', () => {
    expect(visible([-5, 30], [5, -30])).toBe(true)
    expect(visible([175, -30], [5, -30])).toBe(false)
  })

  it('turns a tap back into coordinates, or null off the globe', () => {
    const ll = pointAt(p, [200, 200])!
    expect(ll[0]).toBeCloseTo(-5)
    expect(ll[1]).toBeCloseTo(30)
    expect(pointAt(p, [2, 2])).toBeNull()
  })
})

describe('globe zoom', () => {
  it('magnifies around the rotation center and stays within its limits', () => {
    const near = makeProjection(400, [5, -30], 4)
    const [x, y] = near([-5, 30])!
    expect(x).toBeCloseTo(200)
    expect(y).toBeCloseTo(200)
    expect(near.scale()).toBeCloseTo(makeProjection(400, [5, -30]).scale() * 4)
    expect(clampZoom(0.2)).toBe(1)
    expect(clampZoom(50)).toBe(8)
  })

  it('still turns a tap into coordinates when zoomed in', () => {
    const near = makeProjection(400, [5, -30], 4)
    const ll = pointAt(near, [10, 10])!
    expect(ll).not.toBeNull()
    const back = near(ll)!
    expect(back[0]).toBeCloseTo(10)
    expect(back[1]).toBeCloseTo(10)
  })
})
