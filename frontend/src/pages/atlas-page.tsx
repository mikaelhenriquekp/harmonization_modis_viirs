import { lazy, Suspense, useCallback, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'

import type { Resolution } from '@/api/firemap'
import { GridSwitch, ImageryPicker, LayerSwitch } from '@/components/atlas/atlas-controls'
import { MonthTimeline } from '@/components/atlas/month-timeline'
import { PlacePanel } from '@/components/atlas/place-panel'
import { WorldPanel } from '@/components/atlas/world-panel'
import { Card } from '@/components/card'
import type { MapInset, MapLayer } from '@/components/explore/area-map'
import { PlacePicker } from '@/components/explore/place-picker'
import { MapLegend } from '@/components/map/map-legend'
import { Skeleton } from '@/components/state'
import { useExploreParams } from '@/hooks/use-explore-params'
import {
  useAnomalyMap,
  useCalendar,
  useCoverage,
  useFireMap,
  useHotspots,
  useRegions,
} from '@/hooks/use-fire'
import { WORLD, type Area } from '@/lib/area'
import { basemapById } from '@/lib/basemaps'
import { countryAt } from '@/lib/country'
import { detailDays, parseDetections } from '@/lib/detections'
import { lastCompleteMonth } from '@/lib/insights'
import { formatCoords, formatMonth } from '@/lib/format'
import {
  dataArea,
  DETECTIONS_ZOOM,
  fitResolution,
  RESOLUTIONS,
  type ResolutionChoice,
  type Viewport,
} from '@/lib/viewport'

const AreaMap = lazy(() =>
  import('@/components/explore/area-map').then((m) => ({ default: m.AreaMap })),
)

const WHOLE_WORLD = { area: WORLD, name: 'The whole world' }
const LAYERS: MapLayer[] = ['fire', 'anomalies', 'detections']

/** Room the floating cards take on a wide screen, so the map fits places between them. */
const INSET: MapInset = { top: 16, left: 372, right: 392, bottom: 180 }

function readLayer(v: string | null): MapLayer {
  return LAYERS.includes(v as MapLayer) ? (v as MapLayer) : 'fire'
}

function readGrid(v: string | null): ResolutionChoice {
  const n = Number(v)
  return RESOLUTIONS.includes(n as Resolution) ? (n as Resolution) : 'auto'
}

/** A box around a point, to show the region a fire sits in. */
function around(lat: number, lon: number, deg: number): Area {
  return {
    kind: 'bbox',
    west: Math.max(-180, lon - deg * 1.5),
    east: Math.min(180, lon + deg * 1.5),
    south: Math.max(-85, lat - deg),
    north: Math.min(85, lat + deg),
  }
}

/** The fire atlas: every month since 2002 on a map, and the record of any place on it. */
export function AtlasPage() {
  const [{ area, name }, update] = useExploreParams(WHOLE_WORLD)
  const [params, setParams] = useSearchParams()
  const layer = readLayer(params.get('layer'))
  const grid = readGrid(params.get('grid'))
  const basemap = basemapById(params.get('imagery'))
  const setParam = useCallback(
    (key: string, value: string | null) =>
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          if (value === null) next.delete(key)
          else next.set(key, value)
          return next
        },
        { replace: true },
      ),
    [setParams],
  )

  const [viewport, setViewport] = useState<Viewport | null>(null)
  // fly to the place of the link once; afterwards only places picked by name
  const [fitTo, setFitTo] = useState<Area | null>(area)
  const lastPick = useRef(0)

  const world = area.kind === 'world'
  const coverage = useCoverage()
  const regions = useRegions()
  const record = useCalendar(area, {})
  const worldRecord = useCalendar(WORLD, {})
  const cal = record.data?.calendar
  const dataUntil = cal?.data_until ?? coverage.data?.recent_last_day
  // open on the last whole month: the current one is still filling up
  const latest = dataUntil ? lastCompleteMonth(dataUntil) : undefined
  const month = params.get('month') ?? latest

  const zoom = viewport?.zoom ?? 2
  const viewArea = viewport ? dataArea(viewport) : WORLD
  const res = fitResolution(viewArea, grid, zoom)
  const mapArea = viewArea.kind === 'world' ? undefined : viewArea
  const canDetect = zoom >= DETECTIONS_ZOOM && viewArea.kind === 'bbox'
  const shown: MapLayer = layer === 'detections' && !canDetect ? 'fire' : layer

  const fire = useFireMap(
    { from: month, to: month, resolution: res, area: mapArea },
    shown === 'fire' && !!month && !!viewport,
  )
  // the anomaly grid follows the zoom only: comparing small cells is noise
  const anomalyRes: Resolution = viewArea.kind === 'world' ? 2 : (Math.max(res, 0.5) as Resolution)
  const anomalies = useAnomalyMap(
    { month, resolution: anomalyRes, area: mapArea },
    shown === 'anomalies' && !!month && !!viewport,
  )
  const worldAnomalies = useAnomalyMap({ resolution: 2 }, world)
  const days = month && dataUntil ? detailDays(month, dataUntil) : null
  const hotspots = useHotspots(viewArea, days?.from, days?.to, shown === 'detections')
  const detections = useMemo(
    () => (hotspots.data ? parseDetections(hotspots.data) : undefined),
    [hotspots.data],
  )

  const imageryDay =
    month && dataUntil ? (`${month}-15` < dataUntil ? `${month}-15` : dataUntil) : ''

  const pick = useCallback(
    (lat: number, lon: number, km?: number) => {
      const token = ++lastPick.current
      const radiusKm = km ?? (area.kind === 'point' ? area.radiusKm : 25)
      const next: Area = { kind: 'point', lat, lon, radiusKm }
      update({ area: next, name: `${radiusKm} km around ${formatCoords(lat, lon)}` })
      // name the place after the country whose borders hold the point
      void countryAt(lat, lon).then((c) => {
        if (token !== lastPick.current) return
        update({
          area: next,
          name: c ? `${radiusKm} km around a point in ${c.name}` : `${radiusKm} km out at sea`,
        })
      })
    },
    [area, update],
  )

  const loading =
    (shown === 'fire' && fire.isFetching) ||
    (shown === 'anomalies' && anomalies.isFetching) ||
    (shown === 'detections' && hotspots.isFetching)
  const failed =
    (shown === 'fire' && fire.isError) ||
    (shown === 'anomalies' && anomalies.isError) ||
    (shown === 'detections' && hotspots.isError)
  const period = month ? formatMonth(month) : undefined

  return (
    // a phone stacks the parts with the map high up; a wide screen floats them over the map
    <div className="relative flex flex-col gap-4 py-4 lg:block lg:h-svh lg:overflow-hidden lg:p-0">
      <div className="contents lg:absolute lg:top-4 lg:left-4 lg:z-[1000] lg:flex lg:w-[340px] lg:flex-col lg:gap-3">
        <Card className="relative z-[1010] order-1 mx-4 space-y-4 p-5 lg:mx-0">
          <div>
            <h1 className="text-[26px] leading-none font-bold tracking-[-0.02em]">
              Fire <span className="serif text-[30px] tracking-normal">atlas</span>
            </h1>
            <p className="text-soft mt-2 hidden text-[13px] leading-snug sm:block">
              Every satellite hotspot since 2002, MODIS and VIIRS on one scale.
            </p>
          </div>
          <PlacePicker
            compact
            regions={regions.data}
            onPick={(a, n) => {
              update({ area: a, name: n })
              setFitTo(a)
            }}
          />
          <LayerSwitch value={layer} onChange={(l) => setParam('layer', l === 'fire' ? null : l)} />
          {layer === 'detections' && (
            <p className="text-soft text-[12px] leading-snug">
              {canDetect
                ? 'Each detection at its own pixel: 375 m for VIIRS, 1 km for MODIS. Zoom in closer to see the ground each one covers.'
                : 'Zoom in to a region to see single detections. Until then the map shows hotspots per cell.'}
            </p>
          )}
        </Card>
        <Card className="relative z-[1000] order-5 mx-4 space-y-4 p-5 lg:mx-0">
          {layer === 'fire' && (
            <div>
              <p className="text-soft mb-1.5 text-[12px]">Cell size</p>
              <GridSwitch
                value={grid}
                onChange={(g) => setParam('grid', g === 'auto' ? null : String(g))}
              />
            </div>
          )}
          <ImageryPicker
            value={basemap}
            day={imageryDay}
            onChange={(b) => setParam('imagery', b.layer ? b.id : null)}
          />
        </Card>
      </div>

      <div className="atlas-map relative isolate order-2 mx-4 h-[62svh] min-h-[380px] overflow-hidden rounded-[20px] lg:absolute lg:inset-0 lg:m-0 lg:h-full lg:rounded-none">
        <Suspense fallback={<Skeleton className="size-full rounded-none" />}>
          <AreaMap
            area={area}
            fitTo={fitTo}
            layer={shown}
            fire={fire.data}
            anomalies={anomalies.data?.cells}
            anomalyResolution={anomalies.data?.resolution ?? anomalyRes}
            detections={detections}
            basemap={basemap}
            imageryDay={imageryDay}
            onPick={(lat, lon) => pick(lat, lon)}
            onViewport={setViewport}
            inset={typeof window !== 'undefined' && window.innerWidth >= 1024 ? INSET : undefined}
            zoomControl="bottomright"
            className="size-full"
          />
        </Suspense>
      </div>

      <Card className="relative z-[1000] order-3 mx-4 flex flex-col gap-4 p-4 sm:flex-row sm:items-end sm:gap-6 lg:absolute lg:right-[392px] lg:bottom-4 lg:left-4 lg:mx-0">
        <div className="sm:w-[230px] sm:shrink-0" aria-live="polite">
          {failed ? (
            <p className="text-coral text-[12px] leading-snug">
              The map data did not load.{' '}
              <button
                type="button"
                className="text-bone underline underline-offset-2"
                onClick={() => {
                  void fire.refetch()
                  void anomalies.refetch()
                  void hotspots.refetch()
                }}
              >
                Try again
              </button>
            </p>
          ) : (
            <MapLegend
              layer={shown}
              period={loading ? 'loading…' : period}
              max={fire.data?.max_hotspots}
              cellDegrees={fire.data?.resolution ?? res}
              count={detections?.length}
            />
          )}
        </div>
        {cal ? (
          <MonthTimeline
            months={cal.months}
            value={month ?? cal.months.at(-1)!.month}
            onChange={(m) => setParam('month', m === latest ? null : m)}
            className="min-w-0 flex-1"
          />
        ) : (
          <Skeleton className="h-[78px] flex-1" />
        )}
      </Card>

      <Card className="relative z-[1000] order-4 mx-4 p-6 lg:absolute lg:top-4 lg:right-4 lg:mx-0 lg:max-h-[calc(100svh-2rem)] lg:w-[360px] lg:overflow-y-auto">
        {world ? (
          <WorldPanel
            calendar={worldRecord.data?.calendar}
            anomalies={worldAnomalies.data}
            onPick={(lat, lon) => {
              setFitTo(around(lat, lon, 4))
              pick(lat, lon, 50)
            }}
          />
        ) : (
          <PlacePanel
            area={area}
            name={name}
            calendar={cal}
            month={month}
            error={record.error}
            onRetry={() => void record.refetch()}
            onRadius={(km) => area.kind === 'point' && pick(area.lat, area.lon, km)}
            onClose={() => update(WHOLE_WORLD)}
            className="min-h-full"
          />
        )}
      </Card>
    </div>
  )
}
