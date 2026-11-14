import { lazy, Suspense, useId, useState } from 'react'
import { Link, useLocation } from 'react-router'

import { BigNumber, Card, Delta } from '@/components/card'
import type { MapView } from '@/components/explore/area-map'
import { MapLegend } from '@/components/map/map-legend'
import { ErrorState, Skeleton } from '@/components/state'
import { useExploreParams } from '@/hooks/use-explore-params'
import { useCalendar, useFireMap } from '@/hooks/use-fire'
import { ATTRIBUTION } from '@/lib/attribution'
import { changePct, defaultPeriods, periodRange, periodTotal, type Unit } from '@/lib/compare'
import { formatCount, formatMonth } from '@/lib/format'
import { cn } from '@/lib/utils'

const AreaMap = lazy(() =>
  import('@/components/explore/area-map').then((m) => ({ default: m.AreaMap })),
)

const FIRST_MONTH = '2002-07'
const FIRST_YEAR = 2002

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
  const field = 'bg-card-2 border-line rounded-md border px-2 py-1.5 font-mono text-[13px]'
  const lastYear = Number(lastMonth.slice(0, 4))
  return (
    <div className="flex items-center gap-2">
      <label htmlFor={id} className="text-[13px] font-semibold">
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
          {Array.from({ length: lastYear - FIRST_YEAR + 1 }, (_, i) => FIRST_YEAR + i).map((y) => (
            <option key={y}>{y}</option>
          ))}
        </select>
      )}
    </div>
  )
}

/** Time machine: the same place in two periods, on two maps that move together. */
export function ComparePage() {
  const [{ area, name }] = useExploreParams()
  const { search } = useLocation()
  const [unit, setUnit] = useState<Unit>('month')
  const [picked, setPicked] = useState<{ a?: string; b?: string }>({})
  const [view, setView] = useState<MapView | undefined>()
  const calendar = useCalendar(area, {})
  const cal = calendar.data?.calendar
  const world = area.kind === 'world'
  const resolution = world ? 1 : 0.25
  const defaults = cal ? defaultPeriods(cal.data_until, unit) : null
  const a = picked.a ?? defaults?.a
  const b = picked.b ?? defaults?.b
  const mapArea = world ? undefined : area
  const fireA = useFireMap({ ...(a ? periodRange(a, unit) : {}), resolution, area: mapArea })
  const fireB = useFireMap({ ...(b ? periodRange(b, unit) : {}), resolution, area: mapArea })
  // one scale for both maps, or the colours could not be compared
  const scaleMax = Math.max(fireA.data?.max_hotspots ?? 0, fireB.data?.max_hotspots ?? 0, 1)
  const totalA = cal && a ? periodTotal(cal, a, unit) : null
  const totalB = cal && b ? periodTotal(cal, b, unit) : null
  const change = totalA && totalB ? changePct(totalA.hotspots, totalB.hotspots) : null

  if (calendar.isError && !cal) {
    return (
      <div className="mx-auto max-w-[1100px] px-4 py-10">
        <ErrorState error={calendar.error} onRetry={() => void calendar.refetch()} />
      </div>
    )
  }

  const sides = [
    { key: 'A', period: a, fire: fireA.data, total: totalA },
    { key: 'B', period: b, fire: fireB.data, total: totalB },
  ] as const

  return (
    <div className="mx-auto max-w-[1720px] space-y-4 px-3 py-4 sm:px-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Time machine</p>
          <h1 className="mt-1 text-[26px] leading-tight font-bold tracking-tight sm:text-[32px]">
            {name}, <span className="serif">then and now</span>
          </h1>
        </div>
        <Link
          to={{ pathname: '/', search }}
          className="border-line rounded-full border px-4 py-2 text-[13px] font-semibold hover:bg-white/5"
        >
          Change the place on the dashboard
        </Link>
      </div>

      <Card className="flex flex-wrap items-center gap-x-6 gap-y-3 p-4">
        <div role="group" aria-label="Compare by" className="flex gap-1">
          {(['month', 'year'] as const).map((u) => (
            <button
              key={u}
              type="button"
              aria-pressed={unit === u}
              onClick={() => {
                setUnit(u)
                setPicked({})
              }}
              className={cn(
                'border-line h-9 rounded-full border px-4 text-[13px] font-semibold capitalize',
                unit === u ? 'border-saffron bg-saffron-soft text-saffron' : 'hover:bg-white/5',
              )}
            >
              {u}
            </button>
          ))}
        </div>
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
          <Skeleton className="h-9 w-72" />
        )}
        {totalA && totalB && (
          <p className="text-soft ml-auto flex items-center gap-2 text-[13px]">
            B against A
            {change !== null ? (
              <Delta pct={change} className="text-[15px]" />
            ) : (
              <span className="text-mute">no fire in A to compare with</span>
            )}
          </p>
        )}
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {sides.map((s) => (
          <Card key={s.key} className="relative min-w-0 overflow-hidden">
            <div className="border-line flex flex-wrap items-baseline gap-x-3 border-b px-4 py-2.5">
              <p className="eyebrow">{s.key}</p>
              <p className="text-[15px] font-semibold">{s.period ? label(s.period, unit) : '…'}</p>
              {s.total && (
                <BigNumber className="ml-auto text-[18px]">
                  {formatCount(s.total.hotspots)}
                  <span className="text-mute ml-1.5 text-[11px] font-normal">hotspots</span>
                </BigNumber>
              )}
            </div>
            <Suspense fallback={<Skeleton className="h-[52svh] min-h-[340px] rounded-none" />}>
              <AreaMap
                area={area}
                layer="fire"
                fire={s.fire}
                scaleMax={scaleMax}
                view={view}
                onView={setView}
                className="h-[52svh] min-h-[340px] w-full"
              />
            </Suspense>
            {s.total && (s.total.estimated || s.total.incomplete) && (
              <p className="bg-card-2 text-soft px-4 py-2 text-[12px]">
                {s.total.estimated &&
                  'Before February 2012: estimated from MODIS on the VIIRS scale, good for patterns, not for single fires. '}
                {s.total.incomplete && 'This period is not complete yet.'}
              </p>
            )}
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap items-start gap-4">
        <MapLegend
          layer="fire"
          period="Same scale on both maps"
          max={scaleMax}
          cellDegrees={resolution}
        />
        <p className="text-soft max-w-2xl text-[13px] leading-relaxed">
          Both maps count harmonized hotspots, so a year seen by MODIS and a year seen by VIIRS are
          in the same unit. Drag or zoom one map and the other follows. Totals are for {name}; the
          maps show the same place.
        </p>
      </div>
      <footer className="border-line text-mute border-t pt-4 text-[11px] leading-relaxed">
        {ATTRIBUTION}
      </footer>
    </div>
  )
}
