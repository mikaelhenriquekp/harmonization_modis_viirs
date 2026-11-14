import { areaToParams, type Area } from '@/lib/area'

import { API_BASE_URL, api } from './client'
import { toQuery } from './query'
import type { CalendarResponse, SensorsResponse } from './types'

/** Months "YYYY-MM"; both optional (the API defaults to the whole record). */
export interface MonthRange {
  from?: string
  to?: string
}

function query(area: Area, range: MonthRange): string {
  return toQuery({ ...areaToParams(area), from: range.from, to: range.to })
}

export function getCalendar(area: Area, range: MonthRange, signal?: AbortSignal) {
  return api.get<CalendarResponse>(`/calendar${query(area, range)}`, { signal })
}

export function getSensors(area: Area, range: MonthRange, signal?: AbortSignal) {
  return api.get<SensorsResponse>(`/sensors${query(area, range)}`, { signal })
}

export function calendarCsvUrl(area: Area, range: MonthRange): string {
  return `${API_BASE_URL}/calendar.csv${query(area, range)}`
}
