import type { SensorsResponse } from '@/api/types'

export interface Jumps {
  /** MODIS until 2011, VIIRS after: the raw record. */
  unharmonized: number | null
  harmonized: number | null
  /** One sensor throughout: the reference a good harmonization matches. */
  aquaOnly: number | null
}

/** Mean yearly total of 2012–2014 over that of 2009–2011 (1 = no step). */
export function jumps(data: SensorsResponse): Jumps {
  const years = new Map<number, { raw: number; harmonized: number; aqua: number }>()
  for (const m of data.months) {
    const y = Number(m.month.slice(0, 4))
    const r = years.get(y) ?? { raw: 0, harmonized: 0, aqua: 0 }
    r.raw += m.month <= '2012-01' ? m.aqua : m.snpp
    r.harmonized += m.harmonized
    r.aqua += m.aqua
    years.set(y, r)
  }
  const ratio = (key: 'raw' | 'harmonized' | 'aqua') => {
    const mean = (a: number, b: number) => {
      const v = []
      for (let y = a; y <= b; y++) if (years.has(y)) v.push(years.get(y)![key])
      return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null
    }
    const before = mean(2009, 2011)
    const after = mean(2012, 2014)
    return before && after !== null ? after / before : null
  }
  return { unharmonized: ratio('raw'), harmonized: ratio('harmonized'), aquaOnly: ratio('aqua') }
}
