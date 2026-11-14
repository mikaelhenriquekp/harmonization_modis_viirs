import { describe, expect, it } from 'vitest'

import { makeProjection, pointAt, visible } from './globe'

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
