import { areaToParams, type Area } from '@/lib/area'

import { API_BASE_URL } from './client'
import { toQuery } from './query'

/** Raw detections of an area between two days (YYYY-MM-DD), as CSV. */
export function hotspotsCsvUrl(area: Area, from: string, to: string, all = false): string {
  return `${API_BASE_URL}/hotspots.csv${toQuery({ ...areaToParams(area), from, to, all: all || undefined })}`
}
