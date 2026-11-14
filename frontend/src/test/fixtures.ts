import type { Calendar, CalendarResponse, MonthStat, SensorsResponse } from '@/api/types'

/** A small but complete calendar: 2010-01..2013-03, August always busiest. */
export function calendarFixture(): Calendar {
  const months: MonthStat[] = []
  for (let y = 2010; y <= 2013; y++) {
    for (let m = 1; m <= 12; m++) {
      if (y === 2013 && m > 3) break
      const hotspots = m === 8 ? 100 + y - 2010 : 10
      months.push({
        month: `${y}-${String(m).padStart(2, '0')}`,
        year: y,
        month_of_year: m,
        hotspots,
        frp_mw: hotspots * 5,
        source: y < 2012 || (y === 2012 && m === 1) ? 'aqua_harmonized' : 'viirs_snpp',
        estimated: y < 2012 || (y === 2012 && m === 1),
        provisional: false,
        incomplete: y === 2013 && m === 3,
        median_same_month: m === 8 ? 101 : 10,
        anomaly_pct: m === 8 ? 1 : 0,
        percentile: 0.5,
        class: m === 8 ? 3 : 1,
      })
    }
  }
  const values = [2010, 2011, 2012, 2013].map((y) =>
    Array.from(
      { length: 12 },
      (_, i) => months.find((s) => s.year === y && s.month_of_year === i + 1)?.hotspots ?? null,
    ),
  )
  const classes = [2010, 2011, 2012, 2013].map((y) =>
    Array.from(
      { length: 12 },
      (_, i) => months.find((s) => s.year === y && s.month_of_year === i + 1)?.class ?? -1,
    ),
  )
  return {
    from: '2010-01',
    to: '2013-03',
    data_until: '2013-03-14',
    months,
    grid: { years: [2010, 2011, 2012, 2013], values, classes },
    climatology: Array.from({ length: 12 }, (_, i) => ({
      month_of_year: i + 1,
      years: 3,
      median: i === 7 ? 101 : 10,
      mean: i === 7 ? 101 : 10,
      p25: i === 7 ? 100.5 : 10,
      p75: i === 7 ? 101.5 : 10,
      min: i === 7 ? 100 : 10,
      max: i === 7 ? 102 : 10,
    })),
    years: [
      { year: 2010, hotspots: 210, frp_mw: 1050, months: 12, complete: true, rank: 3 },
      { year: 2011, hotspots: 211, frp_mw: 1055, months: 12, complete: true, rank: 2 },
      { year: 2012, hotspots: 212, frp_mw: 1060, months: 12, complete: true, rank: 1 },
      { year: 2013, hotspots: 30, frp_mw: 150, months: 3, complete: false, rank: null },
    ],
    current: {
      month: '2013-03',
      hotspots: 10,
      incomplete: true,
      elapsed_fraction: 0.452,
      projected: 22.1,
      median: 10,
      expected_by_now: 4.5,
      anomaly_pct: 121,
      percentile: 1,
      rank: 1,
      years_compared: 3,
      status: 'much_above',
    },
    peak: {
      month_of_year: 8,
      record_month: '2012-08',
      record_hotspots: 102,
      busiest_year: 2012,
      busiest_year_hotspots: 212,
      quietest_year: 2010,
      quietest_year_hotspots: 210,
    },
    scale: {
      palette: 'YlOrRd',
      breaks: [10, 50],
      colors: ['#f2f2f2', '#ffffb2', '#fd8d3c', '#b10026'],
    },
  }
}

export function calendarResponseFixture(): CalendarResponse {
  return {
    area: {
      world: false,
      bbox: [-2.35, 37.37, -0.65, 38.76],
      grid_bbox: [-2.5, 37.25, -0.5, 39],
      cells: 56,
    },
    archive_end: '2012-12',
    calendar: calendarFixture(),
    regions: [
      { id: 'Spain', name: 'Spain', status: 'ok', quality: 'good', scope: 'own', model: 'C' },
    ],
    notes: ['Months up to 2012-01 are an estimate.'],
    attribution: 'NASA FIRMS',
  }
}

export function sensorsFixture(): SensorsResponse {
  const months = []
  for (let y = 2009; y <= 2014; y++) {
    for (let m = 1; m <= 12; m++) {
      const vi = y >= 2012
      months.push({
        month: `${y}-${String(m).padStart(2, '0')}`,
        aqua: 10,
        snpp: vi ? 50 : 0,
        n20: 0,
        harmonized: 50,
      })
    }
  }
  return {
    area: { world: true, bbox: [-180, -90, 180, 90], grid_bbox: [-180, -90, 180, 90], cells: 1 },
    months,
    ratios: { snpp_over_aqua: 5, n20_over_snpp: null },
    attribution: 'NASA FIRMS',
  }
}
