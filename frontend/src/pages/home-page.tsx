import { Flame, TriangleAlert } from 'lucide-react'
import { lazy, Suspense, useMemo, useState } from 'react'

import { BigNumber, Card, Delta } from '@/components/card'
import type { GlobePin } from '@/components/globe/globe'
import { DropPanel } from '@/components/home/drop-panel'
import { Coverage, MonthCards, SeasonPulse } from '@/components/home/home-cards'
import { ErrorState, Skeleton } from '@/components/state'
import { useAnomalyMap, useCalendar, useCoverage, useFireMap } from '@/hooks/use-fire'
import { WORLD } from '@/lib/area'
import { formatCount, formatMonth, formatSignedPct, monthName } from '@/lib/format'
import { monthVsLastYear, yearSoFar } from '@/lib/insights'

const Globe = lazy(() => import('@/components/globe/globe').then((m) => ({ default: m.Globe })))

const PIN_COLORS = ['var(--garnet)', 'var(--coral)', 'var(--saffron)', 'var(--slate)']

/** Global fire activity: the globe, and where to look first. */
export function HomePage() {
  const world = useCalendar(WORLD, {})
  const coverage = useCoverage()
  const month = (world.data?.calendar.data_until ?? coverage.data?.recent_last_day)?.slice(0, 7)
  const fire = useFireMap({ from: month, to: month, resolution: 1 })
  const anomalies = useAnomalyMap({ resolution: 2 })
  const [drop, setDrop] = useState<{ lat: number; lon: number } | null>(null)
  const [radius, setRadius] = useState(10)

  const pins = useMemo<GlobePin[]>(() => {
    const cells = (anomalies.data?.cells ?? [])
      .filter((c) => c.status === 'much_above' && c.projected >= 20)
      .sort((a, b) => b.projected - a.projected)
    const picked: typeof cells = []
    for (const c of cells) {
      if (picked.every((p) => Math.hypot(p.lat - c.lat, p.lon - c.lon) > 25)) picked.push(c)
      if (picked.length === 4) break
    }
    return picked.map((c, i) => ({
      id: `${c.lat},${c.lon}`,
      lat: c.lat,
      lon: c.lon,
      color: PIN_COLORS[i],
      label: `Far above normal: about ${formatCount(c.projected)} hotspots this month${c.anomaly_pct !== null ? ` (${formatSignedPct(c.anomaly_pct)} vs usual)` : ''}. See this place.`,
    }))
  }, [anomalies.data])

  const cal = world.data?.calendar
  const ys = cal ? yearSoFar(cal) : null
  const thisMonth = cal ? monthVsLastYear(cal) : null
  const unusual = (anomalies.data?.counts.much_above ?? 0) + (anomalies.data?.counts.above ?? 0)
  const pick = (lat: number, lon: number) => setDrop({ lat, lon })

  return (
    <div className="relative min-h-svh overflow-hidden">
      <div className="mx-auto grid max-w-[1600px] grid-cols-1 gap-6 px-4 py-6 sm:px-8 lg:min-h-svh lg:grid-cols-[400px_minmax(0,1fr)_260px] lg:grid-rows-[auto_1fr_auto] lg:gap-x-8 lg:py-10">
        <section className="min-w-0 lg:col-start-1 lg:row-start-1" aria-labelledby="home-title">
          <h1
            id="home-title"
            className="text-[34px] leading-none font-bold tracking-[-0.02em] sm:text-[38px]"
          >
            Global fire activity
          </h1>
          <p className="text-soft mt-6 text-[14px]">
            Harmonized hotspots{ys ? `, ${ys.year} so far` : ''}
          </p>
          {ys ? (
            <div className="mt-1 flex items-baseline gap-3">
              <BigNumber className="text-[40px] leading-tight sm:text-[44px]">
                {formatCount(ys.value)}
              </BigNumber>
              <Delta pct={ys.changePct} className="text-[13px]" />
            </div>
          ) : (
            <Skeleton className="mt-2 h-12 w-56" />
          )}
          {ys && ys.changePct !== null && (
            <p className="text-mute text-[12px]">
              vs an average {monthName(1, 'short')}–{monthName(ys.months, 'short')}
            </p>
          )}
          <ul className="mt-6 space-y-4">
            <li className="flex items-center gap-4">
              <span className="bg-saffron text-on-accent grid size-12 shrink-0 place-items-center rounded-[14px]">
                <Flame className="size-5" fill="currentColor" />
              </span>
              <div>
                <p className="text-soft text-[14px]">
                  {thisMonth ? `${formatMonth(thisMonth.month)} so far` : 'This month so far'}
                </p>
                <p className="flex items-baseline gap-2">
                  <span className="num font-mono font-semibold">
                    {thisMonth ? formatCount(thisMonth.value) : '…'}
                  </span>
                  {thisMonth && (
                    <span className="text-mute text-[12px]">
                      <Delta pct={thisMonth.changePct} /> vs last year
                    </span>
                  )}
                </p>
              </div>
            </li>
            <li className="flex items-center gap-4">
              <span className="bg-garnet grid size-12 shrink-0 place-items-center rounded-[14px]">
                <TriangleAlert className="size-5" />
              </span>
              <div>
                <p className="text-soft text-[14px]">
                  Places with more fire than usual
                  {anomalies.data ? ` in ${monthName(Number(anomalies.data.month.slice(5)))}` : ''}
                </p>
                <p className="num font-mono font-semibold">
                  {anomalies.data ? formatCount(unusual) : '…'}
                </p>
              </div>
            </li>
          </ul>
        </section>

        <section
          aria-label="Globe"
          className="relative flex min-w-0 flex-col items-center justify-center gap-6 lg:col-start-2 lg:row-span-3 lg:row-start-1"
        >
          <Suspense
            fallback={<Skeleton className="aspect-square w-full max-w-[640px] rounded-full" />}
          >
            <Globe
              fire={
                fire.data?.cells.map(([la, lo, h]) => [la, lo, h] as [number, number, number]) ?? []
              }
              maxFire={fire.data?.max_hotspots ?? 1}
              pins={pins}
              marker={drop}
              onPick={pick}
              className="aspect-square w-full max-w-[680px] lg:max-h-[calc(100svh-12rem)]"
            />
          </Suspense>
          <p className="text-soft text-center text-[13px]">
            Tap a place on the globe, or a pin, to see its fire record. Drag to turn it.
          </p>
        </section>

        <section aria-label="Fire season" className="min-w-0 lg:col-start-3 lg:row-start-1">
          {cal ? <SeasonPulse calendar={cal} /> : <Skeleton className="h-64" />}
        </section>

        <section
          aria-label="Recent months"
          className="min-w-0 lg:col-start-1 lg:row-start-3 lg:self-end"
        >
          {world.isError ? (
            <ErrorState error={world.error} onRetry={() => void world.refetch()} />
          ) : cal ? (
            <MonthCards calendar={cal} />
          ) : (
            <Skeleton className="h-64" />
          )}
        </section>

        <section aria-label="Coverage" className="lg:col-start-3 lg:row-start-3 lg:self-end">
          {coverage.data && coverage.data.regions.total > 0 && (
            <Coverage
              harmonized={coverage.data.regions.harmonized}
              total={coverage.data.regions.total}
            />
          )}
        </section>
      </div>

      {drop && (
        <div className="fixed inset-0 z-[700] md:inset-auto md:top-0 md:right-0 md:bottom-0 md:w-[392px]">
          <button
            type="button"
            aria-label="Close"
            onClick={() => setDrop(null)}
            className="absolute inset-0 bg-black/50 md:hidden"
          />
          <Card className="absolute inset-x-0 bottom-0 max-h-[85svh] overflow-hidden rounded-b-none md:inset-0 md:max-h-none md:rounded-none md:border-y-0 md:border-r-0">
            <DropPanel
              lat={drop.lat}
              lon={drop.lon}
              radiusKm={radius}
              onRadius={setRadius}
              onClose={() => setDrop(null)}
              className="h-full max-h-[85svh] md:max-h-none"
            />
          </Card>
        </div>
      )}
    </div>
  )
}
