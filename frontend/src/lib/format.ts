const exact = new Intl.NumberFormat('en', { maximumFractionDigits: 1 })
const whole = new Intl.NumberFormat('en', { maximumFractionDigits: 0 })
const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 })

/** Hotspot counts: one decimal when small, compact when huge. */
export function formatCount(v: number): string {
  if (Math.abs(v) >= 1_000_000) return compact.format(v)
  if (Math.abs(v) >= 100) return whole.format(v)
  return exact.format(v)
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

/** Month of the year (1–12) as a word. */
export function monthName(m: number, style: 'long' | 'short' | 'narrow' = 'long'): string {
  const name = MONTHS[m - 1] ?? ''
  if (style === 'short') return name.slice(0, 3)
  if (style === 'narrow') return name.slice(0, 1)
  return name
}

/** "2017-07" as "July 2017" (or "Jul 2017"). */
export function formatMonth(month: string, style: 'long' | 'short' = 'long'): string {
  const [y, m] = month.split('-').map(Number)
  return `${monthName(m, style)} ${y}`
}

/** A percentage with its sign, rounded: "+54%", "−100%". */
export function formatSignedPct(v: number): string {
  const r = Math.round(v)
  if (r === 0) return '0%'
  return `${r > 0 ? '+' : '−'}${whole.format(Math.abs(r))}%`
}

/** "37.992° N, 1.130° W". */
export function formatCoords(lat: number, lon: number): string {
  return `${Math.abs(lat).toFixed(3)}° ${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lon).toFixed(3)}° ${lon >= 0 ? 'E' : 'W'}`
}
