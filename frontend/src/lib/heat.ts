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
  return step(cls, n) >= 4 ? 'var(--on-accent)' : 'var(--bone)'
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

/**
 * The fire steps a map cell can take. The darkest calendar step disappears on
 * the dark basemap, so the map starts one step up.
 */
export const MAP_STEPS = [2, 3, 4, 5, 6] as const

/**
 * A map cell's fire step, on a log scale: hotspot counts span four orders of
 * magnitude, and a linear or square-root scale paints all but the largest
 * fires in the first step.
 */
export function mapStep(v: number, max: number): number {
  const share = max > 1 ? Math.log1p(Math.max(v, 0)) / Math.log1p(max) : 0
  const i = Math.min(MAP_STEPS.length - 1, Math.floor(share * MAP_STEPS.length))
  return MAP_STEPS[i]
}

/** The lowest value of each map step, for the legend. */
export function mapBreaks(max: number): number[] {
  return MAP_STEPS.map((_, i) => Math.expm1((Math.log1p(max) * i) / MAP_STEPS.length))
}
