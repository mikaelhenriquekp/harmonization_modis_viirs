import { areaToParams, type Area } from '@/lib/area'

import { api } from './client'
import { toQuery } from './query'
import type { AnomalyResponse, MapResponse } from './types'

export type Resolution = 0.25 | 0.5 | 1 | 2

export interface FireMapQuery {
  from?: string
  to?: string
  resolution?: Resolution
  area?: Area
}

export function getFireMap(q: FireMapQuery, signal?: AbortSignal) {
  const params = {
    ...(q.area ? areaToParams(q.area) : {}),
    from: q.from,
    to: q.to,
    resolution: q.resolution,
  }
  return api.get<MapResponse>(`/map${toQuery(params)}`, { signal })
}

export interface AnomalyQuery {
  month?: string
  resolution?: Resolution
  area?: Area
}

export function getAnomalyMap(q: AnomalyQuery, signal?: AbortSignal) {
  const params = {
    ...(q.area ? areaToParams(q.area) : {}),
    month: q.month,
    resolution: q.resolution,
  }
  return api.get<AnomalyResponse>(`/map/anomalies${toQuery(params)}`, { signal })
}
