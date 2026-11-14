import { afterEach, describe, expect, it, vi } from 'vitest'

import { API_BASE_URL } from './client'
import { calendarCsvUrl, getCalendar, getSensors } from './calendar'
import { getAnomalyMap, getFireMap } from './firemap'
import { hotspotsCsvUrl } from './hotspots'
import { getCoverage, getRegion, getRegions } from './regions'

const murcia = { kind: 'bbox', west: -2.35, south: 37.37, east: -0.65, north: 38.76 } as const

function mockFetch(body: unknown = {}) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status: 200 })),
  )
}

function calledPath(): string {
  return decodeURIComponent(vi.mocked(fetch).mock.calls[0][0] as string)
}

describe('fire API', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('asks for the calendar of an area and period', async () => {
    mockFetch()
    await getCalendar(murcia, { from: '2002-07', to: '2026-11' })
    expect(calledPath()).toBe('/api/calendar?bbox=-2.35,37.37,-0.65,38.76&from=2002-07&to=2026-11')
  })

  it('leaves the period out when not set', async () => {
    mockFetch()
    await getSensors({ kind: 'world' }, {})
    expect(calledPath()).toBe('/api/sensors')
  })

  it('builds download links', () => {
    expect(decodeURIComponent(calendarCsvUrl(murcia, { from: '2010-01' }))).toBe(
      `${API_BASE_URL}/calendar.csv?bbox=-2.35,37.37,-0.65,38.76&from=2010-01`,
    )
    expect(
      decodeURIComponent(
        hotspotsCsvUrl(
          { kind: 'point', lat: 38, lon: -1, radiusKm: 5 },
          '2025-08-01',
          '2025-08-31',
        ),
      ),
    ).toBe(`${API_BASE_URL}/hotspots.csv?lat=38&lon=-1&radius_km=5&from=2025-08-01&to=2025-08-31`)
  })

  it('asks for the maps', async () => {
    mockFetch()
    await getFireMap({ from: '2025-08', to: '2025-08', resolution: 1 })
    expect(calledPath()).toBe('/api/map?from=2025-08&to=2025-08&resolution=1')
    vi.unstubAllGlobals()
    mockFetch()
    await getAnomalyMap({ resolution: 1 })
    expect(calledPath()).toBe('/api/map/anomalies?resolution=1')
  })

  it('asks for regions and coverage', async () => {
    mockFetch({ regions: [] })
    await expect(getRegions()).resolves.toEqual([])
    vi.unstubAllGlobals()
    mockFetch()
    await getRegion('South_Africa')
    expect(calledPath()).toBe('/api/regions/South_Africa')
    vi.unstubAllGlobals()
    mockFetch()
    await getCoverage()
    expect(calledPath()).toBe('/api/coverage')
  })
})
