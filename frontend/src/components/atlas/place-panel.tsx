import { ArrowRight, Columns2, Download, Sparkles, X } from 'lucide-react'
import { Link } from 'react-router'

import { calendarCsvUrl } from '@/api/calendar'
import type { Calendar } from '@/api/types'
import { BigNumber, Delta } from '@/components/card'
import { Mascot } from '@/components/mascot'
import { ErrorState, Skeleton } from '@/components/state'
import { areaToSearch, type Area } from '@/lib/area'
import { askLink } from '@/lib/ask'
import { formatCoords, formatCount, formatMonth, monthName } from '@/lib/format'
import { anomalyClass } from '@/lib/heat'
import { completeMonths, yearSoFar } from '@/lib/insights'
import { statusMeta } from '@/lib/status'
import { cn } from '@/lib/utils'

const RADII = [5, 10, 25, 50] as const

interface PlacePanelProps {
  area: Area
  name: string
  /** The record of the area, while it loads undefined. */
  calendar: Calendar | undefined
  /** The month the map shows, YYYY-MM; the panel speaks about the same one. */
  month?: string
  error?: Error | null
  onRetry?: () => void
  onRadius?: (km: number) => void
  onClose: () => void
  className?: string
}

function SeasonBars({ cal }: { cal: Calendar }) {
  const med = cal.climatology.map((c) => c.median ?? 0)
  const max = Math.max(1, ...med)
  return (
    <div>
      <h3 className="text-soft mb-2 text-[12px] font-normal">Usual fire season</h3>
      <div
        className="flex h-16 items-end gap-1"
        role="img"
        aria-label={`Usual hotspots per month, highest in ${monthName(cal.peak.month_of_year)}`}
      >
        {med.map((v, i) => (
          <span
            key={i}
            className="flex-1 rounded-t-[3px]"
            style={{
              height: `${Math.max(4, (v / max) * 100)}%`,
              background: i + 1 === cal.peak.month_of_year ? 'var(--coral)' : 'var(--heat-3)',
              opacity: v ? 0.9 : 0.2,
            }}
          />
        ))}
      </div>
      <div className="mt-1 flex gap-1" aria-hidden>
        {med.map((_, i) => (
          <span key={i} className="text-mute flex-1 text-center font-mono text-[10px]">
            {monthName(i + 1, 'narrow')}
          </span>
        ))}
      </div>
    </div>
  )
}

function YearBars({ cal }: { cal: Calendar }) {
  const years = cal.years
  const max = Math.max(1, ...years.map((y) => y.hotspots))
  const best = years.reduce((a, b) => (b.hotspots > a.hotspots ? b : a), years[0])
  return (
    <div>
      <h3 className="text-soft mb-2 text-[12px] font-normal">Year by year</h3>
      <svg
        viewBox={`0 0 ${years.length * 10} 48`}
        preserveAspectRatio="none"
        className="h-12 w-full"
        role="img"
        aria-label={`Hotspots per year, most in ${best?.year}`}
      >
        {years.map((y, i) => {
          const h = Math.max(1, (y.hotspots / max) * 46)
          return (
            <rect
              key={y.year}
              x={i * 10 + 1.5}
              width={7}
              y={48 - h}
              height={h}
              fill={y.year === best?.year ? 'var(--coral)' : 'var(--heat-3)'}
              opacity={y.complete ? 0.95 : 0.45}
            />
          )
        })}
      </svg>
      <div className="text-mute num mt-1 flex justify-between font-mono text-[10px]" aria-hidden>
        <span>{years[0]?.year}</span>
        <span>{years.at(-1)?.year}</span>
      </div>
    </div>
  )
}

/** What the record says about the chosen place: totals, this month, and its usual season. */
export function PlacePanel({
  area,
  name,
  calendar: cal,
  month,
  error,
  onRetry,
  onRadius,
  onClose,
  className,
}: PlacePanelProps) {
  const search = `?${new URLSearchParams({ area: areaToSearch(area), name }).toString()}`
  const total = cal ? cal.years.reduce((s, y) => s + y.hotspots, 0) : 0
  const lastFire = cal ? [...cal.months].reverse().find((m) => m.hotspots > 0) : undefined
  const ys = cal ? yearSoFar(completeMonths(cal)) : null
  const shown = cal?.months.find((m) => m.month === month) ?? cal?.months.at(-1)
  const meta = shown ? statusMeta(anomalyClass(shown.percentile)) : null
  const hasSeason = !!cal && cal.climatology.some((c) => (c.median ?? 0) > 0)

  return (
    <section aria-label={`Fire record of ${name}`} className={cn('flex flex-col gap-5', className)}>
      <header className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-[20px] leading-tight font-semibold text-balance">{name}</h2>
          {area.kind === 'point' && (
            <p className="text-soft num mt-0.5 font-mono text-[12px]">
              {formatCoords(area.lat, area.lon)}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Back to the whole world"
          title="Back to the whole world"
          className="text-soft hover:text-bone -mt-1 -mr-2 grid size-10 shrink-0 place-items-center rounded-full transition-colors hover:bg-white/5 active:scale-95"
        >
          <X className="size-5" />
        </button>
      </header>

      {area.kind === 'point' && onRadius && (
        <div>
          <div className="flex gap-1.5" role="group" aria-label="Radius around the point">
            {RADII.map((r) => (
              <button
                key={r}
                type="button"
                aria-pressed={r === area.radiusKm}
                onClick={() => onRadius(r)}
                className={cn(
                  'h-9 flex-1 rounded-full border text-[13px] font-semibold transition-colors active:scale-95',
                  r === area.radiusKm
                    ? 'border-saffron bg-saffron-soft text-saffron'
                    : 'border-line text-soft hover:text-bone hover:bg-white/5',
                )}
              >
                {r} km
              </button>
            ))}
          </div>
          <p className="text-mute mt-2 text-[12px] leading-snug">
            Fire is counted in 25 km cells, so a small radius reads the cell under the point.
          </p>
        </div>
      )}

      {error && !cal ? (
        <ErrorState error={error} onRetry={onRetry} />
      ) : !cal ? (
        <div className="space-y-3" aria-busy>
          <Skeleton className="h-28" />
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
      ) : total === 0 ? (
        <div className="bg-card-2 flex items-center gap-4 rounded-[16px] p-5">
          <p className="min-w-0 flex-1 text-[14px] leading-snug">
            No fire detected here since {cal.from.slice(0, 4)}.
            {area.kind === 'point' && area.radiusKm < 50 && (
              <span className="text-soft"> Try a wider radius.</span>
            )}
          </p>
          <Mascot mood="happy" label="The mascot looks happy" className="w-14 shrink-0" />
        </div>
      ) : (
        <>
          <div className="bg-card-2 flex gap-4 rounded-[16px] p-5">
            <div className="min-w-0 flex-1">
              <p className="text-soft text-[12px]">Hotspots since {cal.from.slice(0, 4)}</p>
              <BigNumber className="text-[34px] leading-tight">{formatCount(total)}</BigNumber>
              {shown && meta && (
                <p className="mt-1 text-[14px] leading-snug">
                  {formatMonth(shown.month)} {shown.incomplete ? 'is so far' : 'was'}{' '}
                  <strong>{meta.phrase}</strong>: {formatCount(shown.hotspots)} hotspots
                  {shown.median_same_month !== null && (
                    <>, usually {formatCount(Math.round(shown.median_same_month))}</>
                  )}
                  .
                </p>
              )}
            </div>
            {meta && (
              <Mascot
                mood={meta.mood}
                label={`The mascot looks ${meta.mood}`}
                className="w-14 shrink-0 self-center"
              />
            )}
          </div>

          <dl className="divide-line grid grid-cols-3 divide-x">
            <div className="pr-3">
              <dt className="text-mute text-[12px]">Last fire</dt>
              <dd className="num mt-1 font-mono text-[14px]">
                {lastFire ? formatMonth(lastFire.month, 'short') : 'none'}
              </dd>
            </div>
            <div className="px-3">
              <dt className="text-mute text-[12px]">Peak month</dt>
              <dd className="mt-1 font-mono text-[14px]">
                {hasSeason ? monthName(cal.peak.month_of_year, 'short') : '–'}
              </dd>
            </div>
            <div className="pl-3">
              <dt className="text-mute text-[12px]">{ys?.year} vs usual</dt>
              <dd className="mt-1 font-mono text-[14px]">
                {ys && ys.changePct !== null ? (
                  <Delta pct={ys.changePct} className="text-[14px]" />
                ) : (
                  '–'
                )}
              </dd>
            </div>
          </dl>

          {hasSeason && <SeasonBars cal={cal} />}
          {cal.years.length > 1 && <YearBars cal={cal} />}
        </>
      )}

      <div className="mt-auto flex flex-col gap-2 pt-1">
        <Link
          to={`/analysis${search}#calendar`}
          className="bg-saffron text-on-accent flex h-11 items-center justify-center gap-2 rounded-full text-[14px] font-semibold transition-[filter,transform] hover:brightness-110 active:scale-[0.98]"
        >
          Open the analysis <ArrowRight className="size-[18px]" />
        </Link>
        <div className="flex gap-2">
          <Link
            to={`/compare${search}`}
            className="border-line flex h-11 flex-1 items-center justify-center gap-2 rounded-full border text-[14px] font-semibold transition-colors hover:bg-white/5 active:scale-[0.98]"
          >
            <Columns2 className="size-[18px]" /> Compare years
          </Link>
          <Link
            to={askLink(
              { area, name },
              `What does the fire record say about ${name}? Is this year unusual?`,
            )}
            aria-label="Ask Ember about this place"
            title="Ask Ember"
            className="ember-edge text-saffron grid size-11 shrink-0 place-items-center rounded-full bg-[rgb(240_192_72/0.1)] transition-colors hover:bg-[rgb(240_192_72/0.18)]"
          >
            <Sparkles className="size-[18px]" />
          </Link>
          <a
            href={calendarCsvUrl(area, {})}
            download
            aria-label="Download the monthly record as CSV"
            title="Download CSV"
            className="border-line grid size-11 shrink-0 place-items-center rounded-full border transition-colors hover:bg-white/5"
          >
            <Download className="size-[18px]" />
          </a>
        </div>
      </div>
    </section>
  )
}
