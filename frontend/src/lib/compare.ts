import type { Calendar } from '@/api/types'

export type Unit = 'month' | 'year'

/** The months a period covers: one month, or a whole year. */
export function periodRange(period: string, unit: Unit): { from: string; to: string } {
  return unit === 'year'
    ? { from: `${period.slice(0, 4)}-01`, to: `${period.slice(0, 4)}-12` }
    : { from: period, to: period }
}

/** The harmonized total of a period, and whether any of it is estimated from MODIS. */
export function periodTotal(c: Calendar, period: string, unit: Unit) {
  const { from, to } = periodRange(period, unit)
  const months = c.months.filter((m) => m.month >= from && m.month <= to)
  return {
    hotspots: months.reduce((s, m) => s + m.hotspots, 0),
    months: months.length,
    estimated: months.some((m) => m.estimated),
    incomplete: months.some((m) => m.incomplete) || (unit === 'year' && months.length < 12),
  }
}

/** Default periods: the latest one and the same one ten years earlier. */
export function defaultPeriods(dataUntil: string, unit: Unit): { a: string; b: string } {
  const year = Number(dataUntil.slice(0, 4))
  if (unit === 'year') {
    const b = year - 1 // the last complete year
    return { a: String(Math.max(2003, b - 10)), b: String(b) }
  }
  const month = dataUntil.slice(5, 7)
  return { a: `${year - 10}-${month}`, b: `${year}-${month}` }
}

/** B against A, in percent; null when A is zero. */
export function changePct(a: number, b: number): number | null {
  return a > 0 ? ((b - a) / a) * 100 : null
}
