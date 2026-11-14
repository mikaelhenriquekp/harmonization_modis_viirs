import type { SensorsResponse } from '@/api/types'

/** The series of the sensors chart, in their validated color order. */
export const SERIES = [
  { key: 'harmonized', label: 'Harmonized', color: 'var(--series-harmonized)', width: 3 },
  { key: 'aqua', label: 'MODIS Aqua', color: 'var(--series-aqua)', width: 2 },
  { key: 'snpp', label: 'Suomi NPP', color: 'var(--series-snpp)', width: 2 },
  { key: 'n20', label: 'NOAA-20', color: 'var(--series-n20)', width: 2 },
] as const

type Key = (typeof SERIES)[number]['key']
export type YearRow = { year: number } & Record<Key, number>

/** Yearly totals of each sensor and of the harmonized series. */
export function annualTotals(data: SensorsResponse): YearRow[] {
  const rows = new Map<number, YearRow>()
  for (const m of data.months) {
    const y = Number(m.month.slice(0, 4))
    const r = rows.get(y) ?? { year: y, harmonized: 0, aqua: 0, snpp: 0, n20: 0 }
    r.harmonized += m.harmonized
    r.aqua += m.aqua
    r.snpp += m.snpp
    r.n20 += m.n20
    rows.set(y, r)
  }
  return [...rows.values()].sort((a, b) => a.year - b.year)
}
