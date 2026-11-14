import { areaToParams, type Area } from '@/lib/area'

import { API_BASE_URL, api } from './client'
import { toQuery } from './query'

/** Raw detections of an area between two days (YYYY-MM-DD), as CSV. */
export function hotspotsCsvUrl(area: Area, from: string, to: string, all = false): string {
  return `${API_BASE_URL}/hotspots.csv${toQuery({ ...areaToParams(area), from, to, all: all || undefined })}`
}

export interface HotspotsResponse {
  from: string
  to: string
  count: number
  columns: string[]
  rows: (string | number | boolean | null)[][]
  attribution: string
}

/** Raw detections as compact JSON, for previews and zoomed-in maps. */
export function getHotspots(area: Area, from: string, to: string, signal?: AbortSignal) {
  return api.get<HotspotsResponse>(`/hotspots${toQuery({ ...areaToParams(area), from, to })}`, {
    signal,
  })
}
