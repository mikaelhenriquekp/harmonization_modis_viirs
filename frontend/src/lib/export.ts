const DAY = 86_400_000

/** Today (YYYY-MM-DD), for when the data has not said yet how far it reaches. */
export const TODAY = new Date().toISOString().slice(0, 10)

/** First and last day of a span of months ("YYYY-MM"), the last capped at `until`. */
export function monthSpanDays(from: string, to: string, until?: string) {
  const [y, m] = to.split('-').map(Number)
  const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)
  const end = until && until < last ? until : last
  const start = `${from}-01`
  return { from: start, to: end, days: Math.round((Date.parse(end) - Date.parse(start)) / DAY) + 1 }
}

/** A file-name friendly version of a place name. */
export function slug(name: string): string {
  return (
    name
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'area'
  )
}
