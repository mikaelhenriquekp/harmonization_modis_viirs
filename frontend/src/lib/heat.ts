const STEPS = 7

/** The ramp steps (1–7) used by n color classes, spread from light to dark. */
export function heatSteps(n: number): number[] {
  if (n <= 1) return [4]
  return Array.from({ length: n }, (_, i) => Math.round(1 + (i * (STEPS - 1)) / (n - 1)))
}

/**
 * The CSS color of a calendar class: -1 outside the range, 0 no hotspots,
 * 1..n a step of the theme's validated fire ramp.
 */
export function heatColor(cls: number, n: number): string {
  if (cls < 0) return 'transparent'
  if (cls === 0) return 'var(--heat-0)'
  return `var(--heat-${heatSteps(n)[Math.min(cls, n) - 1]})`
}
