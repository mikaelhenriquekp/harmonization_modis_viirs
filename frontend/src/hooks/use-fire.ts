import { keepPreviousData, useQuery } from '@tanstack/react-query'

import { getCalendar, getSensors, type MonthRange } from '@/api/calendar'
import { getAnomalyMap, getFireMap, type AnomalyQuery, type FireMapQuery } from '@/api/firemap'
import { getHotspots } from '@/api/hotspots'
import { getCoverage, getRegion, getRegions } from '@/api/regions'
import { areaToSearch, type Area } from '@/lib/area'

export const fireKeys = {
  calendar: (area: Area, range: MonthRange) =>
    ['calendar', areaToSearch(area), range.from, range.to] as const,
  sensors: (area: Area, range: MonthRange) =>
    ['sensors', areaToSearch(area), range.from, range.to] as const,
  map: (q: FireMapQuery) =>
    ['map', q.from, q.to, q.resolution, q.area && areaToSearch(q.area)] as const,
  anomalies: (q: AnomalyQuery) =>
    ['anomalies', q.month, q.resolution, q.area && areaToSearch(q.area)] as const,
  regions: ['regions'] as const,
  region: (id: string) => ['regions', id] as const,
  coverage: ['coverage'] as const,
}

const FIVE_MINUTES = 5 * 60_000

export function useCalendar(area: Area, range: MonthRange) {
  return useQuery({
    queryKey: fireKeys.calendar(area, range),
    queryFn: ({ signal }) => getCalendar(area, range, signal),
    placeholderData: keepPreviousData,
    staleTime: FIVE_MINUTES,
  })
}

export function useSensors(area: Area, range: MonthRange) {
  return useQuery({
    queryKey: fireKeys.sensors(area, range),
    queryFn: ({ signal }) => getSensors(area, range, signal),
    placeholderData: keepPreviousData,
    staleTime: FIVE_MINUTES,
  })
}

export function useFireMap(q: FireMapQuery) {
  return useQuery({
    queryKey: fireKeys.map(q),
    queryFn: ({ signal }) => getFireMap(q, signal),
    placeholderData: keepPreviousData,
    staleTime: FIVE_MINUTES,
  })
}

export function useAnomalyMap(q: AnomalyQuery, enabled = true) {
  return useQuery({
    queryKey: fireKeys.anomalies(q),
    queryFn: ({ signal }) => getAnomalyMap(q, signal),
    placeholderData: keepPreviousData,
    staleTime: FIVE_MINUTES,
    enabled,
  })
}

export function useRegions() {
  return useQuery({
    queryKey: fireKeys.regions,
    queryFn: ({ signal }) => getRegions(signal),
    staleTime: FIVE_MINUTES,
  })
}

export function useRegion(id: string | undefined) {
  return useQuery({
    queryKey: fireKeys.region(id ?? ''),
    queryFn: ({ signal }) => getRegion(id!, signal),
    enabled: !!id,
    staleTime: FIVE_MINUTES,
  })
}

export function useCoverage() {
  return useQuery({
    queryKey: fireKeys.coverage,
    queryFn: ({ signal }) => getCoverage(signal),
    staleTime: 60_000,
  })
}

export function useHotspots(area: Area, from: string | undefined, to: string | undefined) {
  return useQuery({
    queryKey: ['hotspots', areaToSearch(area), from, to] as const,
    queryFn: ({ signal }) => getHotspots(area, from!, to!, signal),
    enabled: !!from && !!to,
    staleTime: FIVE_MINUTES,
    retry: false,
  })
}
