import { lazy, Suspense, useEffect, useReducer, useState } from 'react'

import { AreaNotes } from '@/components/explore/area-notes'
import type { MapLayer } from '@/components/explore/area-map'
import { CurrentStatus } from '@/components/explore/current-status'
import { Downloads } from '@/components/explore/downloads'
import { DrawTools } from '@/components/explore/draw-tools'
import { LayerToggle } from '@/components/explore/layer-toggle'
import { PeriodPicker } from '@/components/explore/period-picker'
import { PlacePicker } from '@/components/explore/place-picker'
import { BurningCalendar } from '@/components/charts/burning-calendar'
import { SeasonChart } from '@/components/charts/season-chart'
import { YearsChart } from '@/components/charts/years-chart'
import { ErrorState, Section, Skeleton } from '@/components/state'
import { useExploreParams } from '@/hooks/use-explore-params'
import { useAnomalyMap, useCalendar, useCoverage, useFireMap, useRegions } from '@/hooks/use-fire'
import { drawingReducer, initialDrawing } from '@/lib/drawing'
import { formatCount, formatMonth } from '@/lib/format'
import { statusMeta } from '@/lib/status'

const AreaMap = lazy(() =>
  import('@/components/explore/area-map').then((m) => ({ default: m.AreaMap })),
)

const DRAWN_NAMES = {
  polygon: 'Your shape',
  bbox: 'Your rectangle',
  point: 'Around your point',
  world: 'The whole world',
} as const

export function ExplorePage() {
  const [{ area, name, from, to }, update] = useExploreParams()
  const range = { from, to }
  const [drawing, dispatch] = useReducer(drawingReducer, initialDrawing)
  const [layer, setLayer] = useState<MapLayer>('fire')

  const calendar = useCalendar(area, range)
  const regions = useRegions()
  const coverage = useCoverage()
  const lastDay = calendar.data?.calendar.data_until ?? coverage.data?.recent_last_day
  const lastMonth = lastDay?.slice(0, 7)
  const fire = useFireMap({ from: lastMonth, to: lastMonth, resolution: 1 })
  const anomalies = useAnomalyMap({ resolution: 1 }, layer === 'anomalies')

  // A finished drawing becomes the area.
  useEffect(() => {
    if (drawing.done) {
      update({ area: drawing.done, name: DRAWN_NAMES[drawing.done.kind] })
      dispatch({ type: 'consumed' })
    }
  }, [drawing.done, update])

  const data = calendar.data
  const [currentYear] = useState(() => new Date().getUTCFullYear())

  return (
    <div className="mx-auto grid max-w-[1440px] grid-cols-1 gap-x-8 gap-y-6 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(360px,38%)_minmax(0,1fr)]">
      <aside
        aria-label="Choose an area"
        className="min-w-0 space-y-3 self-start lg:sticky lg:top-20"
      >
        <PlacePicker regions={regions.data} onPick={(a, n) => update({ area: a, name: n })} />
        <DrawTools drawing={drawing} dispatch={dispatch} />
        <div className="border-line relative overflow-hidden rounded-xl border">
          <Suspense
            fallback={<Skeleton className="h-[44svh] rounded-none lg:h-[calc(100svh-19rem)]" />}
          >
            <AreaMap
              area={area}
              drawing={drawing}
              dispatch={dispatch}
              layer={layer}
              fire={fire.data}
              anomalies={anomalies.data?.cells}
              className="h-[44svh] min-h-[280px] w-full lg:h-[calc(100svh-19rem)]"
            />
          </Suspense>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <LayerToggle value={layer} onChange={setLayer} />
          <p className="text-muted-foreground tabular text-xs">
            {layer === 'fire' &&
              fire.data &&
              `${formatMonth(fire.data.from, 'short')}: ${formatCount(fire.data.total_hotspots)} hotspots`}
            {layer === 'anomalies' &&
              anomalies.data &&
              `${formatMonth(anomalies.data.month, 'short')}: ${anomalies.data.counts.much_above ?? 0} cells ${statusMeta('much_above').phrase}`}
          </p>
        </div>
      </aside>

      <div className="min-w-0 space-y-14 pb-10">
        {calendar.isError && !data ? (
          <ErrorState
            error={calendar.error}
            onRetry={() => void calendar.refetch()}
            title="The calendar for this area could not be loaded"
          />
        ) : !data ? (
          <div className="space-y-4">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-[480px] w-full" />
          </div>
        ) : (
          <>
            <div
              className={
                calendar.isFetching ? 'opacity-60 transition-opacity' : 'transition-opacity'
              }
            >
              <CurrentStatus data={data} name={name} />
            </div>

            <Section
              id="calendar"
              title={`${data.calendar.grid.years.length} years of fire, month by month`}
              description={`Harmonized hotspots in ${name}, ${formatMonth(data.calendar.from, 'short')} to ${formatMonth(data.calendar.to, 'short')}. One unit throughout: what VIIRS (375 m) sees.`}
              actions={
                <PeriodPicker
                  from={from}
                  to={to}
                  currentYear={currentYear}
                  onChange={(r) => update(r)}
                />
              }
            >
              <BurningCalendar calendar={data.calendar} />
            </Section>

            <Section
              id="normal"
              title="Is this normal?"
              description="The shaded band is where the middle half of past years falls for each month; the dashed line is the median."
            >
              <SeasonChart calendar={data.calendar} />
            </Section>

            <Section
              id="years"
              title="Years ranked by hotspots"
              description="Complete years, ranked; the three busiest are numbered."
            >
              <YearsChart calendar={data.calendar} />
            </Section>

            <Section id="downloads" title="Take the analysis with you">
              <Downloads
                key={data.calendar.data_until}
                area={area}
                range={range}
                dataUntil={data.calendar.data_until}
              />
            </Section>

            <Section id="notes" title="Reading these numbers">
              <AreaNotes data={data} />
            </Section>
          </>
        )}
      </div>
    </div>
  )
}
