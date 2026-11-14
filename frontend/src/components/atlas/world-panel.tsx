import { ChevronRight } from 'lucide-react'
import { useMemo } from 'react'

import type { AnomalyResponse, Calendar } from '@/api/types'
import { BigNumber, Delta } from '@/components/card'
import { Skeleton } from '@/components/state'
import { useCountry } from '@/hooks/use-country'
import { formatCoords, formatCount, formatMonth, formatSignedPct, monthName } from '@/lib/format'
import { monthVsLastYear, yearSoFar } from '@/lib/insights'

interface Hot {
  lat: number
  lon: number
  projected: number
  pct: number | null
}

/** The busiest cells far above normal, kept apart so one region does not fill the list. */
function hottest(anomalies: AnomalyResponse | undefined, n: number): Hot[] {
  const cells = (anomalies?.cells ?? [])
    .filter((c) => c.status === 'much_above' && c.projected >= 20)
    .sort((a, b) => b.projected - a.projected)
  const picked: typeof cells = []
  for (const c of cells) {
    if (picked.every((p) => Math.hypot(p.lat - c.lat, p.lon - c.lon) > 15)) picked.push(c)
    if (picked.length === n) break
  }
  return picked.map((c) => ({
    lat: c.lat,
    lon: c.lon,
    projected: c.projected,
    pct: c.anomaly_pct,
  }))
}

function HotRow({ hot, onPick }: { hot: Hot; onPick: (lat: number, lon: number) => void }) {
  const country = useCountry({ lat: hot.lat, lon: hot.lon })
  const where = country.data?.name ?? (country.isPending ? '…' : formatCoords(hot.lat, hot.lon))
  return (
    <li>
      <button
        type="button"
        onClick={() => onPick(hot.lat, hot.lon)}
        className="group -mx-2 flex w-[calc(100%+1rem)] items-center gap-3 rounded-[12px] px-2 py-2 text-left transition-colors hover:bg-white/5 active:scale-[0.99]"
      >
        <span aria-hidden className="bg-tone-critical size-2 shrink-0 rounded-full" />
        <span className="min-w-0 flex-1 truncate text-[14px]">{where}</span>
        <span className="num text-soft font-mono text-[12px]">
          {formatCount(hot.projected)}
          {hot.pct !== null && (
            <span className="text-coral ml-1.5">{formatSignedPct(hot.pct)}</span>
          )}
        </span>
        <ChevronRight
          aria-hidden
          className="text-mute group-hover:text-bone size-4 shrink-0 transition-colors"
        />
      </button>
    </li>
  )
}

/** The world at a glance: this year, this month, and where fire is far above normal. */
export function WorldPanel({
  calendar: cal,
  anomalies,
  onPick,
}: {
  calendar: Calendar | undefined
  anomalies: AnomalyResponse | undefined
  onPick: (lat: number, lon: number) => void
}) {
  const ys = cal ? yearSoFar(cal) : null
  const month = cal ? monthVsLastYear(cal) : null
  const hot = useMemo(() => hottest(anomalies, 5), [anomalies])
  const unusual = anomalies
    ? (anomalies.counts.much_above ?? 0) + (anomalies.counts.above ?? 0)
    : null

  return (
    <section aria-label="The whole world" className="flex flex-col gap-6">
      <div>
        <h2 className="text-soft text-[13px] font-normal">
          The whole world{ys ? `, ${ys.year} so far` : ''}
        </h2>
        {ys ? (
          <>
            <div className="mt-1 flex items-baseline gap-3">
              <BigNumber className="text-[38px] leading-tight">{formatCount(ys.value)}</BigNumber>
              <Delta pct={ys.changePct} className="text-[13px]" />
            </div>
            <p className="text-mute text-[12px]">
              hotspots, against an average {monthName(1, 'short')}–{monthName(ys.months, 'short')}
            </p>
          </>
        ) : (
          <Skeleton className="mt-2 h-14 w-48" />
        )}
      </div>

      <dl className="divide-line grid grid-cols-2 divide-x">
        <div className="pr-4">
          <dt className="text-mute text-[12px]">
            {month ? `${formatMonth(month.month, 'short')} so far` : 'This month'}
          </dt>
          <dd className="mt-1 flex items-baseline gap-2">
            <span className="num font-mono text-[16px] font-semibold">
              {month ? formatCount(month.value) : '…'}
            </span>
            {month && <Delta pct={month.changePct} />}
          </dd>
          {month && month.changePct !== null && (
            <dd className="text-mute text-[11px]">vs last year</dd>
          )}
        </div>
        <div className="pl-4">
          <dt className="text-mute text-[12px]">Cells above normal</dt>
          <dd className="num mt-1 font-mono text-[16px] font-semibold">
            {unusual !== null ? formatCount(unusual) : '…'}
          </dd>
          {anomalies && (
            <dd className="text-mute text-[11px]">
              of {formatCount(anomalies.cells.length)} burning
            </dd>
          )}
        </div>
      </dl>

      <div>
        <h3 className="text-[15px] font-semibold">Far above normal now</h3>
        <p className="text-mute mt-0.5 text-[12px]">
          Expected hotspots this month, against the usual for the month
        </p>
        {anomalies ? (
          hot.length > 0 ? (
            <ul className="mt-2">
              {hot.map((h) => (
                <HotRow key={`${h.lat},${h.lon}`} hot={h} onPick={onPick} />
              ))}
            </ul>
          ) : (
            <p className="text-soft mt-3 text-[13px]">
              Nowhere is far above its usual fire for this month.
            </p>
          )
        ) : (
          <div className="mt-3 space-y-2" aria-busy>
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-8" />
            ))}
          </div>
        )}
      </div>

      <p className="text-mute text-[12px] leading-snug">
        Tap anywhere on the map, or search a place, to read its record since 2002.
      </p>
    </section>
  )
}
