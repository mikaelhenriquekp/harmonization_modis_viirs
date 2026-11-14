import type { HotspotsResponse } from '@/api/hotspots'

import type { Bounds } from './area'

/** One satellite detection at its own resolution. */
export interface Detection {
  lat: number
  lon: number
  date: string
  time: string
  satellite: string
  confidence: string
  frp: number | null
  scanKm: number | null
  trackKm: number | null
  pass: 'D' | 'N' | null
  provisional: boolean
}

function numberOrNull(v: unknown): number | null {
  const n = typeof v === 'number' ? v : Number(v)
  return v === null || v === '' || !Number.isFinite(n) ? null : n
}

/** Reads the compact rows of /api/hotspots by column name. */
export function parseDetections(res: HotspotsResponse): Detection[] {
  const at = (name: string) => res.columns.indexOf(name)
  const c = {
    lat: at('latitude'),
    lon: at('longitude'),
    date: at('acq_date'),
    time: at('acq_time'),
    satellite: at('satellite'),
    confidence: at('confidence'),
    frp: at('frp'),
    scan: at('scan'),
    track: at('track'),
    pass: at('daynight'),
    provisional: at('provisional'),
  }
  return res.rows.map((r) => {
    const pass = String(r[c.pass] ?? '').toUpperCase()[0]
    return {
      lat: Number(r[c.lat]),
      lon: Number(r[c.lon]),
      date: String(r[c.date] ?? ''),
      time: String(r[c.time] ?? '').padStart(4, '0'),
      satellite: String(r[c.satellite] ?? ''),
      confidence: String(r[c.confidence] ?? ''),
      frp: numberOrNull(r[c.frp]),
      scanKm: numberOrNull(r[c.scan]),
      trackKm: numberOrNull(r[c.track]),
      pass: pass === 'D' || pass === 'N' ? pass : null,
      provisional: r[c.provisional] === true || r[c.provisional] === 'true',
    }
  })
}

const KM_PER_DEGREE = 111.32

/**
 * The ground a detection's pixel covers, from its scan and track size. The
 * pixel is drawn north-up; the real one is tilted with the orbit.
 */
export function footprint(d: Detection): Bounds {
  const scan = d.scanKm ?? 0.375
  const track = d.trackKm ?? 0.375
  const dLat = track / 2 / KM_PER_DEGREE
  const dLon = scan / 2 / (KM_PER_DEGREE * Math.max(Math.cos((d.lat * Math.PI) / 180), 0.01))
  return [
    [d.lat - dLat, d.lon - dLon],
    [d.lat + dLat, d.lon + dLon],
  ]
}

/** Fire radiative power classes of the detail layer, in MW. */
export const FRP_CLASSES = [
  { upTo: 5, label: 'under 5 MW', color: 'var(--heat-3)' },
  { upTo: 20, label: '5 to 20 MW', color: 'var(--heat-4)' },
  { upTo: 100, label: '20 to 100 MW', color: 'var(--heat-5)' },
  { upTo: Infinity, label: 'over 100 MW', color: 'var(--heat-6)' },
]

export function frpColor(frp: number | null): string {
  if (frp === null) return 'var(--slate)'
  return FRP_CLASSES.find((c) => frp < c.upTo)!.color
}

/** The days the detail layer asks for: a whole month, or the last week of data. */
export function detailDays(month: string | null, dataUntil: string): { from: string; to: string } {
  if (month) {
    const [y, m] = month.split('-').map(Number)
    const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)
    return { from: `${month}-01`, to: last < dataUntil ? last : dataUntil }
  }
  const from = new Date(Date.parse(dataUntil) - 6 * 86_400_000).toISOString().slice(0, 10)
  return { from, to: dataUntil }
}
