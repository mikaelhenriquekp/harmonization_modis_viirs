// Mirrors backend/api/openapi.yaml.

export type Status = 'much_above' | 'above' | 'normal' | 'below' | 'much_below' | 'no_history'
export type Source = 'aqua_harmonized' | 'viirs_snpp' | 'viirs_recent'
export type RegionStatus = 'ok' | 'insufficient_data' | 'pending' | 'error'
export type Quality = 'good' | 'review'
export type Scope = 'own' | 'regional'

export interface AreaInfo {
  world: boolean
  bbox: [number, number, number, number]
  grid_bbox: [number, number, number, number]
  cells: number
}

export interface MonthStat {
  month: string
  year: number
  month_of_year: number
  hotspots: number
  frp_mw: number
  source: Source
  estimated: boolean
  provisional: boolean
  incomplete: boolean
  median_same_month: number | null
  anomaly_pct: number | null
  percentile: number | null
  class: number
}

export interface Climatology {
  month_of_year: number
  years: number
  median: number | null
  mean: number | null
  p25: number | null
  p75: number | null
  min: number | null
  max: number | null
}

export interface YearStat {
  year: number
  hotspots: number
  frp_mw: number
  months: number
  complete: boolean
  rank: number | null
}

export interface Current {
  month: string
  hotspots: number
  incomplete: boolean
  elapsed_fraction: number
  projected: number
  median: number | null
  expected_by_now: number | null
  anomaly_pct: number | null
  percentile: number | null
  rank: number
  years_compared: number
  status: Status
}

export interface Peak {
  month_of_year: number
  record_month: string
  record_hotspots: number
  busiest_year: number
  busiest_year_hotspots: number
  quietest_year: number
  quietest_year_hotspots: number
}

export interface Scale {
  palette: string
  breaks: number[]
  colors: string[]
}

export interface Calendar {
  from: string
  to: string
  data_until: string
  months: MonthStat[]
  grid: { years: number[]; values: (number | null)[][]; classes: number[][] }
  climatology: Climatology[]
  years: YearStat[]
  current: Current | null
  peak: Peak
  scale: Scale
}

export interface RegionNote {
  id: string
  name: string
  status: RegionStatus
  quality?: Quality
  scope?: Scope
  model?: string
  pooled_with?: string[]
  warnings?: string[]
}

export interface CalendarResponse {
  area: AreaInfo
  archive_end: string
  calendar: Calendar
  regions: RegionNote[]
  notes: string[]
  attribution: string
}

export interface SensorMonth {
  month: string
  aqua: number
  snpp: number
  n20: number
  harmonized: number
}

export interface SensorsResponse {
  area: AreaInfo
  months: SensorMonth[]
  ratios: { snpp_over_aqua: number | null; n20_over_snpp: number | null }
  attribution: string
}

export interface MapResponse {
  from: string
  to: string
  resolution: number
  columns: string[]
  cells: [lat: number, lon: number, hotspots: number, frp: number][]
  total_hotspots: number
  max_hotspots: number
  attribution: string
}

export interface AnomalyCell {
  lat: number
  lon: number
  hotspots: number
  projected: number
  median: number | null
  anomaly_pct: number | null
  percentile: number | null
  rank: number
  status: Status
}

export interface AnomalyResponse {
  month: string
  data_until: string
  elapsed_fraction: number
  resolution: number
  years_compared: number
  cells: AnomalyCell[]
  counts: Partial<Record<Status, number>>
  attribution: string
}

export interface RegionSummary {
  id: string
  name: string
  status: RegionStatus
  reason?: string
  scope?: Scope
  pooled_with: string[]
  model?: string
  model_name?: string
  energy_model?: string
  quality?: Quality
  warnings: string[]
  bbox: [number, number, number, number] | null
  centroid: [number, number] | null
  first_month?: string
  last_month?: string
}

export interface ExamEntry {
  model: string
  name: string
  bias_pct: number | null
  zone_month_error: number | null
  spearman_cell: number | null
  r2_monthly_total: number | null
  monthly_total_error: number | null
}

export interface RegionDetail extends RegionSummary {
  train_hotspots: number
  exam_hotspots: number
  exam_bias_pct: number | null
  exam_r2: number | null
  exam: ExamEntry[] | null
  energy_exam: ExamEntry[] | null
  jumps: { unharmonized: number | null; harmonized: number | null; aqua_only: number | null } | null
  handover_noaa20_over_snpp: number | null
  periods: { learn: [string, string]; exam: [string, string]; reconstructed: [string, string] }
  harmonized_at?: string
}

export interface Coverage {
  data_start: string
  archive_end: string
  recent_first_day?: string
  recent_last_day?: string
  recent_final_until?: string
  regions: {
    total: number
    harmonized: number
    own_model: number
    regional_model: number
    insufficient_data: number
    pending: number
    error: number
  }
  ingest?: { phase?: string; started_at?: string; finished_at?: string; last_error?: string }
  cell_degrees: number
  citations: string[]
  attribution: string
}
