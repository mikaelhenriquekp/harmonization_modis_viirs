import { ArrowRight, Moon, Sun, X } from 'lucide-react'
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react'
import { Link, useLocation } from 'react-router'

import type { Resolution } from '@/api/firemap'
import { NormalChart } from '@/components/analysis/normal-chart'
import { YearsRanking } from '@/components/analysis/years-ranking'
import { Card } from '@/components/card'
import { SensorsChart } from '@/components/charts/sensors-chart'
import {
  CoordsForm,
  LayerPicker,
  PanelSection,
  ResolutionPicker,
  SpectralPicker,
} from '@/components/dashboard/controls'
import { Kpis } from '@/components/dashboard/kpis'
import { MiniCalendar } from '@/components/dashboard/mini-calendar'
import type { MapLayer } from '@/components/explore/area-map'
import { DrawTools } from '@/components/explore/draw-tools'
import { PeriodPicker } from '@/components/explore/period-picker'
import { PlacePicker } from '@/components/explore/place-picker'
import { ExportPanel } from '@/components/export-panel'
import { MapLegend } from '@/components/map/map-legend'
import { ErrorState, Skeleton } from '@/components/state'
import { useCountry } from '@/hooks/use-country'
import { useExploreParams } from '@/hooks/use-explore-params'
import {
  useAnomalyMap,
  useCalendar,
  useCoverage,
  useFireMap,
  useHotspots,
  useRegions,
  useSensors,
} from '@/hooks/use-fire'
import { useMode } from '@/hooks/use-mode'
import type { Area } from '@/lib/area'
import { ATTRIBUTION } from '@/lib/attribution'
import { DEFAULT_BASEMAP } from '@/lib/basemaps'
import { countryAt } from '@/lib/country'
import { detailDays, parseDetections } from '@/lib/detections'
import { drawingReducer, initialDrawing } from '@/lib/drawing'
import { TODAY } from '@/lib/export'
import { formatCoords, formatCount, formatMonth } from '@/lib/format'
import { passOf } from '@/lib/mode'

const AreaMap = lazy(() =>
  import('@/components/explore/area-map').then((m) => ({ default: m.AreaMap })),
)

const DRAWN_NAMES = {
  polygon: 'Your shape',
  bbox: 'Your rectangle',
  point: 'Around your point',
  world: 'The whole world',
} as const

/** The fire atlas: one place, one period, and every panel reading the same selection. */
export function DashboardPage() {
  const [{ area, name, from, to }, update] = useExploreParams()
  const { search } = useLocation()
  const [mode] = useMode()
  const [layer, setLayer] = useState<MapLayer>('fire')
  const [resolution, setResolution] = useState<Resolution>(0.25)
  const [month, setMonth] = useState<string | null>(null)
  const [basemap, setBasemap] = useState(DEFAULT_BASEMAP)
  const [pickedDay, setPickedDay] = useState<string | null>(null)
  const [radius, setRadius] = useState(25)
  const [bothPasses, setBothPasses] = useState(false)
  const [drawing, dispatch] = useReducer(drawingReducer, initialDrawing)
  const lastPick = useRef(0)

  const world = area.kind === 'world'
  const range = useMemo(() => ({ from, to }), [from, to])
  const regions = useRegions()
  const coverage = useCoverage()
  const calendar = useCalendar(area, range)
  const sensors = useSensors(area, range)
  const data = calendar.data
  const cal = data?.calendar

  // the whole world at 0.25° is too many cells to draw
  const minResolution: Resolution = world ? 1 : 0.25
  const cell = resolution < minResolution ? minResolution : resolution
  const shown: MapLayer = world && layer === 'detections' ? 'fire' : layer
  const mapMonth = month ?? cal?.data_until.slice(0, 7)
  const mapArea = world ? undefined : area

  const fire = useFireMap({ from: mapMonth, to: mapMonth, resolution: cell, area: mapArea })
  const anomalies = useAnomalyMap(
    { month: month ?? undefined, resolution: cell, area: mapArea },
    shown === 'anomalies',
  )
  const days = cal && shown === 'detections' ? detailDays(month, cal.data_until) : null
  const hotspots = useHotspots(area, days?.from, days?.to)
  const pass = passOf(mode)
  const detections = useMemo(() => {
    const all = hotspots.data ? parseDetections(hotspots.data) : []
    return bothPasses ? all : all.filter((d) => d.pass === pass)
  }, [hotspots.data, bothPasses, pass])

  const point = area.kind === 'point' ? { lat: area.lat, lon: area.lon } : null
  const country = useCountry(point)

  const pick = useCallback(
    (lat: number, lon: number, km = radius) => {
      const token = ++lastPick.current
      const next: Area = { kind: 'point', lat, lon, radiusKm: km }
      update({ area: next, name: `${km} km around ${formatCoords(lat, lon)}` })
      // name the place after the country whose borders hold the point
      void countryAt(lat, lon).then((c) => {
        // the area goes again: this callback still holds the URL of before the tap
        if (c && token === lastPick.current) {
          update({ area: next, name: `${km} km around a point in ${c.name}` })
        }
      })
    },
    [radius, update],
  )

  useEffect(() => {
    if (!drawing.done) return
    if (drawing.done.kind === 'point') {
      pick(drawing.done.lat, drawing.done.lon, drawing.done.radiusKm)
    } else {
      update({ area: drawing.done, name: DRAWN_NAMES[drawing.done.kind] })
    }
    dispatch({ type: 'consumed' })
  }, [drawing.done, pick, update])

  const imageryDay =
    pickedDay ??
    (cal ? (month && `${month}-15` < cal.data_until ? `${month}-15` : cal.data_until) : TODAY)

  const period =
    shown === 'detections' && days
      ? `${days.from} to ${days.to}`
      : mapMonth
        ? formatMonth(mapMonth)
        : undefined

  return (
    <div className="mx-auto max-w-[1720px] space-y-4 px-3 py-4 sm:px-5">
      <h1 className="sr-only">Fire Atlas dashboard</h1>
      <Kpis data={data} coverage={coverage.data} month={month} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[290px_minmax(0,1fr)] xl:grid-cols-[290px_minmax(0,1fr)_330px]">
        {/* on a phone the map comes first */}
        <Card className="order-2 min-w-0 p-4 lg:order-none">
          <PanelSection title="Location">
            <p className="mb-2 text-[15px] leading-tight font-semibold">{name}</p>
            <PlacePicker regions={regions.data} onPick={(a, n) => update({ area: a, name: n })} />
            <div className="mt-3">
              <DrawTools drawing={drawing} dispatch={dispatch} />
            </div>
            <details className="mt-3">
              <summary className="text-saffron cursor-pointer text-[12px]">
                Enter coordinates
              </summary>
              <div className="mt-2">
                <CoordsForm
                  radiusKm={radius}
                  onRadius={setRadius}
                  onGo={(la, lo) => pick(la, lo)}
                />
              </div>
            </details>
            {!drawing.tool && (
              <p className="text-mute mt-2 text-[11px]">
                Or tap the map: you get the {radius} km around that point.
              </p>
            )}
          </PanelSection>
          <PanelSection title="Period">
            <PeriodPicker
              from={from}
              to={to}
              currentYear={Number((cal?.data_until ?? TODAY).slice(0, 4))}
              onChange={(r) => update(r)}
            />
          </PanelSection>
          <PanelSection title="Map layer">
            <LayerPicker value={shown} onChange={setLayer} detailAvailable={!world} />
          </PanelSection>
          <PanelSection title="Resolution">
            <ResolutionPicker value={cell} onChange={setResolution} min={minResolution} />
            <p className="text-mute mt-2 text-[11px]">
              The harmonized grid is 0.25° (about 25 km). For single pixels use the 375 m layer and
              zoom in.
            </p>
          </PanelSection>
          <PanelSection title="Spectral vision">
            <SpectralPicker
              value={basemap}
              onChange={setBasemap}
              day={imageryDay}
              onDay={setPickedDay}
              maxDay={cal?.data_until}
            />
          </PanelSection>
        </Card>

        <Card className="relative order-1 flex min-w-0 flex-col overflow-hidden lg:order-none">
          <div className="border-line flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-4 py-2.5 text-[12px]">
            <p className="eyebrow">Interactive fire map</p>
            {month && (
              <button
                type="button"
                onClick={() => setMonth(null)}
                className="bg-saffron-soft text-saffron flex items-center gap-1 rounded-full px-2.5 py-1 font-semibold"
              >
                {formatMonth(month, 'short')} <X className="size-3" />
                <span className="sr-only">Back to the latest month</span>
              </button>
            )}
            {shown === 'detections' && (
              <>
                <span className="text-soft flex items-center gap-1.5">
                  {mode === 'day' ? <Sun className="size-3.5" /> : <Moon className="size-3.5" />}
                  {hotspots.isFetching
                    ? 'Asking NASA FIRMS…'
                    : `${formatCount(detections.length)} ${bothPasses ? '' : mode === 'day' ? 'day ' : 'night '}detections`}
                </span>
                <label className="text-soft flex cursor-pointer items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={bothPasses}
                    onChange={(e) => setBothPasses(e.target.checked)}
                    className="accent-[var(--saffron)]"
                  />
                  day and night
                </label>
              </>
            )}
            {(fire.isFetching || anomalies.isFetching) && shown !== 'detections' && (
              <span className="text-mute">Loading…</span>
            )}
          </div>
          {shown === 'detections' && hotspots.isError && (
            <p className="bg-card-2 text-soft px-4 py-2 text-[12px]">
              NASA FIRMS did not answer, so the single detections cannot be drawn right now. The
              harmonized layers still work.
            </p>
          )}
          {/* the map fills the card, as tall as the panels beside it */}
          <div className="relative min-h-[max(64svh,420px)] flex-1">
            <Suspense fallback={<Skeleton className="absolute inset-0 rounded-none" />}>
              <AreaMap
                area={area}
                drawing={drawing}
                dispatch={dispatch}
                layer={shown}
                fire={fire.data}
                anomalies={anomalies.data?.cells}
                detections={detections}
                basemap={basemap}
                imageryDay={imageryDay}
                onPick={pick}
                className="absolute inset-0"
              />
            </Suspense>
            <MapLegend
              layer={shown}
              period={period}
              max={fire.data?.max_hotspots}
              cellDegrees={cell}
              className="absolute bottom-6 left-2 z-[450]"
            />
          </div>
        </Card>

        <div className="order-3 grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2 lg:order-none lg:col-span-2 xl:col-span-1 xl:grid-cols-1 xl:content-start">
          <Card className="min-w-0 p-4">
            <div className="mb-3 flex items-baseline justify-between gap-2">
              <h2 className="eyebrow">Burning calendar</h2>
              <Link
                to={{ pathname: '/analysis', search, hash: '#calendar' }}
                className="text-saffron flex items-center gap-1 text-[12px] font-semibold"
              >
                Full table <ArrowRight className="size-3" />
              </Link>
            </div>
            {calendar.isError && !data ? (
              <ErrorState error={calendar.error} onRetry={() => void calendar.refetch()} />
            ) : cal ? (
              <MiniCalendar calendar={cal} selected={month} onSelect={setMonth} />
            ) : (
              <Skeleton className="h-72" />
            )}
          </Card>
          <Card className="min-w-0 p-4">
            <h2 className="eyebrow mb-3">Download</h2>
            {point && country.data?.outline && (
              <button
                type="button"
                onClick={() =>
                  update({ area: country.data!.outline!, name: `${country.data!.name} (mainland)` })
                }
                className="border-line mb-3 flex h-9 w-full items-center justify-center gap-1.5 rounded-full border text-[12px] font-semibold hover:bg-white/5"
              >
                Analyse all of {country.data.name} <ArrowRight className="size-3.5" />
              </button>
            )}
            <ExportPanel
              key={`${name}-${cal?.data_until}`}
              area={area}
              name={name}
              country={country.data}
              dataUntil={cal?.data_until}
              from={from}
              to={to}
            />
          </Card>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="min-w-0 p-4 sm:p-5">
          <h2 className="eyebrow mb-3">Is this normal?</h2>
          {cal ? <NormalChart calendar={cal} /> : <Skeleton className="h-64" />}
        </Card>
        <Card className="min-w-0 p-4 sm:p-5">
          <h2 className="eyebrow mb-3">Historical comparison</h2>
          {cal ? <YearsRanking calendar={cal} /> : <Skeleton className="h-64" />}
        </Card>
        <Card className="min-w-0 p-4 sm:p-5">
          <h2 className="eyebrow mb-3">Sensor comparison</h2>
          {sensors.data ? <SensorsChart data={sensors.data} /> : <Skeleton className="h-64" />}
          <Link
            to={{ pathname: '/compare', search }}
            className="text-saffron mt-3 inline-flex items-center gap-1 text-[12px] font-semibold"
          >
            Compare two periods on the map <ArrowRight className="size-3" />
          </Link>
        </Card>
      </div>

      {data && data.notes.length > 0 && (
        <ul className="text-soft space-y-1 text-[12px] leading-relaxed" aria-label="Reading notes">
          {data.notes.map((n) => (
            <li key={n}>· {n}</li>
          ))}
          <li>
            · Day and night mode filters the single detections only; the harmonized counts include
            both passes.
          </li>
        </ul>
      )}
      <footer className="border-line text-mute border-t pt-4 text-[11px] leading-relaxed">
        {ATTRIBUTION}
      </footer>
    </div>
  )
}
