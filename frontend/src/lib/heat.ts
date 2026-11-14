import type { Status } from '@/api/types'

const STEPS = 6

/** The fire steps (1–6) used by n color classes, spread from dark to bright. */
export function heatSteps(n: number): number[] {
  if (n <= 1) return [4]
  return Array.from({ length: n }, (_, i) => Math.round(1 + (i * (STEPS - 1)) / (n - 1)))
}

function step(cls: number, n: number): number {
  if (cls <= 0) return 0
  return heatSteps(n)[Math.min(cls, n) - 1]
}

/** The cell color of a calendar class: -1 outside the range, 0 no hotspots, 1..n fire. */
export function heatColor(cls: number, n: number): string {
  if (cls < 0) return 'transparent'
  return `var(--heat-${step(cls, n)})`
}

/** Readable number color on a calendar cell. */
export function heatInk(cls: number, n: number): string {
  const s = step(cls, n)
  if (s === 0) return 'var(--bone)'
  // the ramp runs dark to bright at night and pale to dark by day: the theme sets both inks
  return s >= 4 ? 'var(--heat-ink-hi)' : 'var(--heat-ink-lo)'
}

/** A month's place among the same month of every year, as a status. */
export function anomalyClass(percentile: number | null): Status {
  if (percentile === null) return 'no_history'
  if (percentile >= 0.9) return 'much_above'
  if (percentile >= 0.75) return 'above'
  if (percentile <= 0.1) return 'much_below'
  if (percentile <= 0.25) return 'below'
  return 'normal'
}

export const ANOMALY_COLOR: Record<Status, string> = {
  much_above: 'var(--anom-much-above)',
  above: 'var(--anom-above)',
  normal: 'var(--anom-normal)',
  below: 'var(--anom-below)',
  much_below: 'var(--anom-much-below)',
  no_history: 'var(--anom-none)',
}

/** A map cell's colour: the six fire steps, by the square root of its share of the maximum. */
export function heatFor(v: number, max: number): string {
  const step = Math.min(6, Math.max(1, Math.ceil((Math.sqrt(v / max) || 0) * 6)))
  return `var(--heat-${step})`
}
