import type { Calendar, MonthStat, YearStat } from '@/api/types'

function pct(value: number, base: number): number | null {
  return base > 0 ? ((value - base) / base) * 100 : null
}

/** This month against the same month of the previous year. */
export function monthVsLastYear(c: Calendar) {
  const last = c.months.at(-1)
  if (!last) return null
  const prev = c.months.find(
    (m) => m.year === last.year - 1 && m.month_of_year === last.month_of_year,
  )
  return {
    month: last.month,
    value: last.hotspots,
    previous: prev?.hotspots ?? null,
    changePct: prev ? pct(last.hotspots, prev.hotspots) : null,
    incomplete: last.incomplete,
  }
}

/** The last n months and their usual total (sum of each month's median). */
export function lastMonths(c: Calendar, n: number) {
  const months: MonthStat[] = c.months.slice(-n)
  const total = months.reduce((s, m) => s + m.hotspots, 0)
  const usual = months.reduce((s, m) => s + (c.climatology[m.month_of_year - 1]?.median ?? 0), 0)
  return { months, total, usual, changePct: pct(total, usual) }
}

/** Share of a typical year (sum of medians) that falls in its n busiest months. */
export function peakShare(c: Calendar, n: number) {
  const medians = c.climatology.map((m) => ({ m: m.month_of_year, v: m.median ?? 0 }))
  const total = medians.reduce((s, m) => s + m.v, 0)
  const top = [...medians].sort((a, b) => b.v - a.v).slice(0, n)
  return {
    months: top.map((t) => t.m),
    share: total > 0 ? (top.reduce((s, t) => s + t.v, 0) / total) * 100 : 0,
  }
}

/** The current year so far against the mean of complete years over the same months. */
export function yearSoFar(c: Calendar) {
  const last = c.months.at(-1)
  if (!last) return null
  const upTo = last.month_of_year
  const value = c.months.filter((m) => m.year === last.year).reduce((s, m) => s + m.hotspots, 0)
  const complete = c.years.filter((y) => y.complete).map((y) => y.year)
  const totals = complete.map((y) =>
    c.months
      .filter((m) => m.year === y && m.month_of_year <= upTo)
      .reduce((s, m) => s + m.hotspots, 0),
  )
  const mean = totals.length ? totals.reduce((s, v) => s + v, 0) / totals.length : 0
  return { year: last.year, value, mean, changePct: pct(value, mean), months: upTo }
}

/** The n busiest complete years. */
export function topYears(c: Calendar, n: number): YearStat[] {
  return c.years
    .filter((y) => y.rank !== null)
    .sort((a, b) => a.rank! - b.rank!)
    .slice(0, n)
}
