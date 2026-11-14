/** A round axis maximum at or above v. */
export function niceMax(v: number): number {
  if (v <= 0) return 1
  const p = 10 ** Math.floor(Math.log10(v))
  const n = v / p
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10
  return step * p
}

export function ticks(max: number, count = 4): number[] {
  return Array.from({ length: count + 1 }, (_, i) => (max * i) / count)
}

/**
 * Moves label positions apart so no two are closer than gap, keeping their
 * order (for direct labels at the end of lines).
 */
export function spreadLabels(ys: number[], gap: number): number[] {
  const order = ys.map((y, i) => ({ y, i })).sort((a, b) => a.y - b.y)
  for (let k = 1; k < order.length; k++) {
    order[k].y = Math.max(order[k].y, order[k - 1].y + gap)
  }
  const out = new Array<number>(ys.length)
  for (const o of order) out[o.i] = o.y
  return out
}
