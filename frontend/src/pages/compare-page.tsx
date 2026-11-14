import { lazy, Suspense, useId, useState } from 'react'

import { Segmented } from '@/components/atlas/atlas-controls'
import { BigNumber, Card, Delta } from '@/components/card'
import type { MapView } from '@/components/explore/area-map'
import { PlacePicker } from '@/components/explore/place-picker'
import { MapLegend } from '@/components/map/map-legend'
import { ErrorState, Skeleton } from '@/components/state'
import { useExploreParams } from '@/hooks/use-explore-params'
import { useCalendar, useFireMap, useRegions } from '@/hooks/use-fire'
import { ATTRIBUTION } from '@/lib/attribution'
import { changePct, defaultPeriods, periodRange, periodTotal, type Unit } from '@/lib/compare'
import { formatCount, formatMonth } from '@/lib/format'
import { dataArea, fitResolution, type Viewport } from '@/lib/viewport'

const AreaMap = lazy(() =>
  import('@/components/explore/area-map').then((m) => ({ default: m.AreaMap })),
)

const FIRST_MONTH = '2002-07'
const FIRST_YEAR = 2002

const UNITS = [
  { value: 'month' as const, label: 'Month' },
  { value: 'year' as const, label: 'Year' },
]

function label(period: string, unit: Unit): string {
  return unit === 'year' ? period.slice(0, 4) : formatMonth(period)
}

function PeriodInput({
  title,
  unit,
  value,
  lastMonth,
  onChange,
}: {
  title: string
  unit: Unit
  value: string
  lastMonth: string
  onChange: (v: string) => void
}) {
  const id = useId()
  const field =
    'bg-card-2 border-line hover:border-mute focus-visible:border-saffron h-10 rounded-full border px-3 font-mono text-[13px] transition-colors'
  const lastYear = Number(lastMonth.slice(0, 4))
  return (
    <div className="flex items-center gap-2">
      <label htmlFor={id} className="text-soft text-[13px]">
        {title}
      </label>
      {unit === 'month' ? (
        <input
          id={id}
          type="month"
          value={value}
          min={FIRST_MONTH}
          max={lastMonth}
          onChange={(e) => e.target.value && onChange(e.target.value)}
          className={field}
        />
      ) : (
        <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={field}>
          {Array.from({ length: lastYear - FIRST_YEAR + 1 }, (_, i) => lastYear - i).map((y) => (
            <option key={y}>{y}</option>
          ))}
        </select>
      )}
    </div>
  )
}

/** Then and now: the same place in two periods, on two maps that move together. */
export function ComparePage() {
  const [{ area, name }, update] = useExploreParams()
  const [unit, setUnit] = useState<Unit>('year')
  const [picked, setPicked] = useState<{ a?: string; b?: string }>({})
  const [view, setView] = useState<MapView | undefined>()
  const [viewport, setViewport] = useState<Viewport | null>(null)
  const regions = useRegions()
  const calendar = useCalendar(area, {})
  const cal = calendar.data?.calendar
  const defaults = cal ? defaultPeriods(cal.data_until, unit) : null
  const a = picked.a ?? defaults?.a
  const b = picked.b ?? defaults?.b

  // both maps show the same view, so one grid serves both
  const viewArea = viewport ? dataArea(viewport) : area
  const resolution = fitResolution(viewArea, 'auto', viewport?.zoom ?? 5)
  const mapArea = viewArea.kind === 'world' ? undefined : viewArea
  const ready = !!viewport
  const fireA = useFireMap(
    { ...(a ? periodRange(a, unit) : {}), resolution, area: mapArea },
    ready && !!a,
  )
  const fireB = useFireMap(
    { ...(b ? periodRange(b, unit) : {}), resolution, area: mapArea },
    ready && !!b,
  )
  // one scale for both maps, or their colours could not be compared
  const scaleMax = Math.max(fireA.data?.max_hotspots ?? 0, fireB.data?.max_hotspots ?? 0, 1)
  const totalA = cal && a ? periodTotal(cal, a, unit) : null
  const totalB = cal && b ? periodTotal(cal, b, unit) : null
  const change = totalA && totalB ? changePct(totalA.hotspots, totalB.hotspots) : null

  const sides = [
    { key: 'A', period: a, fire: fireA, total: totalA },
    { key: 'B', period: b, fire: fireB, total: totalB },
  ] as const

  return (
    <div className="mx-auto max-w-[1720px] space-y-4 px-4 py-6 sm:px-6 lg:py-8">
      <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <div className="min-w-0">
          <h1 className="text-[28px] leading-tight font-bold tracking-[-0.02em] text-balance sm:text-[34px]">
            {name}, <span className="serif tracking-normal">then and now</span>
          </h1>
          {totalA && totalB && a && b && (
            <p className="text-soft mt-2 flex flex-wrap items-baseline gap-x-2 text-[15px]">
              {label(b, unit)} against {label(a, unit)}:
              {change !== null ? (
                <Delta pct={change} className="text-[15px]" />
              ) : (
                <span className="text-mute">no fire in {label(a, unit)} to compare with</span>
              )}
            </p>
          )}
        </div>
        <div className="w-full sm:w-80">
          <PlacePicker
            compact
            regions={regions.data}
            onPick={(next, n) => {
              update({ area: next, name: n })
              setView(undefined)
            }}
          />
        </div>
      </header>

      <Card className="flex flex-wrap items-center gap-x-6 gap-y-3 p-3 sm:p-4">
        <Segmented
          legend="Compare by"
          options={UNITS}
          value={unit}
          onChange={(u) => {
            setUnit(u)
            setPicked({})
          }}
          className="w-48"
        />
        {cal && a && b ? (
          <>
            <PeriodInput
              title="A"
              unit={unit}
              value={a}
              lastMonth={cal.data_until.slice(0, 7)}
              onChange={(v) => setPicked((p) => ({ ...p, a: v }))}
            />
            <PeriodInput
              title="B"
              unit={unit}
              value={b}
              lastMonth={cal.data_until.slice(0, 7)}
              onChange={(v) => setPicked((p) => ({ ...p, b: v }))}
            />
          </>
        ) : (
          <Skeleton className="h-10 w-72" />
        )}
        <MapLegend
          layer="fire"
          max={scaleMax}
          cellDegrees={resolution}
          className="w-full sm:ml-auto sm:w-[240px]"
        />
      </Card>

      {calendar.isError && !cal ? (
        <ErrorState error={calendar.error} onRetry={() => void calendar.refetch()} />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {sides.map((s, i) => (
            <Card key={s.key} className="relative min-w-0 overflow-hidden">
              <div className="border-line flex flex-wrap items-baseline gap-x-3 border-b px-4 py-3">
                <span className="text-mute font-mono text-[12px]">{s.key}</span>
                <h2 className="text-[16px] font-semibold">
                  {s.period ? label(s.period, unit) : '…'}
                </h2>
                {s.fire.isFetching && <span className="text-mute text-[12px]">loading…</span>}
                {s.total && (
                  <BigNumber className="ml-auto text-[18px]">
                    {formatCount(s.total.hotspots)}
                    <span className="text-mute ml-1.5 font-sans text-[12px] font-normal">
                      hotspots
                    </span>
                  </BigNumber>
                )}
              </div>
              <div className="isolate h-[46svh] min-h-[320px] lg:h-[calc(100svh-24rem)] lg:min-h-[400px]">
                <Suspense fallback={<Skeleton className="size-full rounded-none" />}>
                  <AreaMap
                    area={area}
                    layer="fire"
                    fire={s.fire.data}
                    scaleMax={scaleMax}
                    view={view}
                    onView={setView}
                    onViewport={i === 0 ? setViewport : undefined}
                    zoomControl={i === 0 ? 'topleft' : false}
                    className="size-full"
                  />
                </Suspense>
              </div>
              {s.total && (s.total.estimated || s.total.incomplete) && (
                <p className="bg-card-2 text-soft px-4 py-2.5 text-[12px] leading-snug">
                  {s.total.estimated &&
                    'Before February 2012 the count is MODIS, put on the VIIRS scale: good for patterns, not for single fires. '}
                  {s.total.incomplete && 'This period is not over yet.'}
                </p>
              )}
            </Card>
          ))}
        </div>
      )}

      <footer className="border-line text-mute border-t pt-4 text-[11px] leading-relaxed">
        Drag or zoom one map and the other follows. Totals are for {name}; both maps share one
        colour scale. {ATTRIBUTION}
      </footer>
    </div>
  )
}
