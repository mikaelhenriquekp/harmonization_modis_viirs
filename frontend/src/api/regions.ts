import { api } from './client'
import type { Coverage, RegionDetail, RegionSummary } from './types'

export async function getRegions(signal?: AbortSignal): Promise<RegionSummary[]> {
  const res = await api.get<{ regions: RegionSummary[] }>('/regions', { signal })
  return res.regions
}

export function getRegion(id: string, signal?: AbortSignal) {
  return api.get<RegionDetail>(`/regions/${encodeURIComponent(id)}`, { signal })
}

export function getCoverage(signal?: AbortSignal) {
  return api.get<Coverage>('/coverage', { signal })
}
