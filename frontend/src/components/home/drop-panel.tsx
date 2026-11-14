import { CalendarDays, Flame, LayoutDashboard, MapPinOff, Waves, X } from 'lucide-react'
import { Link } from 'react-router'

import { BigNumber, Delta } from '@/components/card'
import { ExportPanel } from '@/components/export-panel'
import { Mascot } from '@/components/mascot'
import { ErrorState, Skeleton } from '@/components/state'
import { useCountry } from '@/hooks/use-country'
import { useCalendar } from '@/hooks/use-fire'
import { areaToSearch, type Area } from '@/lib/area'
import { formatCoords, formatCount, formatMonth, monthName } from '@/lib/format'
import { yearSoFar } from '@/lib/insights'
import { statusMeta } from '@/lib/status'
import { cn } from '@/lib/utils'

const RADII = [1, 5, 10, 25] as const

interface DropPanelProps {
  lat: number
  lon: number
  radiusKm: number
  onRadius: (km: number) => void
  onClose: () => void
  className?: string
}

/** What the record says around a chosen point. */
export function DropPanel({ lat, lon, radiusKm, onRadius, onClose, className }: DropPanelProps) {
  const area: Area = { kind: 'point', lat, lon, radiusKm }
  const q = useCalendar(area, {})
  const data = q.data
  const cal = data?.calendar
  // The country comes from real borders. The API's `regions` are every country
  // whose bounding box touches the area, which named Spain "Netherlands".
  const country = useCountry({ lat, lon })
  const place = country.data?.name
  const name = place
    ? `${radiusKm} km around a point in ${place}`
    : `${radiusKm} km around ${formatCoords(lat, lon)}`
  const search = `?${new URLSearchParams({ area: areaToSearch(area), name }).toString()}`
  const total = cal ? cal.years.reduce((s, y) => s + y.hotspots, 0) : 0
  const lastFire = cal ? [...cal.months].reverse().find((m) => m.hotspots > 0) : undefined
  const ys = cal ? yearSoFar(cal) : null
  const current = cal?.current
  const meta = current ? statusMeta(current.status) : null
  const med = cal?.climatology.map((c) => c.median ?? 0) ?? []
  const maxMed = Math.max(1, ...med)
  const years = cal?.years ?? []
  const maxYear = Math.max(1, ...years.map((y) => y.hotspots))

  return (
    <aside
      aria-label="Fire record around the chosen point"
      className={cn('bg-card border-line flex flex-col gap-5 overflow-y-auto p-6', className)}
    >
      <header className="flex items-start gap-3">
        <span className="bg-saffron-soft text-saffron grid size-11 shrink-0 place-items-center rounded-[12px]">
          <Flame className="size-5" fill="currentColor" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="eyebrow">Chosen point</p>
          <h3 className="truncate text-[20px] leading-tight font-semibold">
            {place ?? (country.isSuccess ? 'Open sea' : 'Your point')}
          </h3>
          <p className="text-soft num font-mono text-[12px]">{formatCoords(lat, lon)}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close results"
          className="text-soft grid size-9 place-items-center rounded-full hover:bg-white/5"
        >
          <X className="size-5" />
        </button>
      </header>

      <div>
        <p className="text-soft mb-2 text-[12px]">Search radius around the exact point</p>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Search radius">
          {RADII.map((r) => (
            <button
              key={r}
              type="button"
              aria-pressed={r === radiusKm}
              onClick={() => onRadius(r)}
              className={cn(
                'h-9 rounded-full border px-4 text-[13px] font-semibold',
                r === radiusKm
                  ? 'border-coral bg-coral text-[#100d0f]'
                  : 'border-line hover:bg-white/5',
              )}
            >
              {r} km
            </button>
          ))}
        </div>
        <p className="text-mute mt-2 text-[11px]">
          Counted on the 0.25° grid (about 25 km): small radii use the cell under the point.
        </p>
      </div>

      {q.isError && !data ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : !cal ? (
        <div className="space-y-3">
          <Skeleton className="h-28" />
          <Skeleton className="h-24" />
        </div>
      ) : (
        <>
          <div className="bg-card-2 flex gap-4 rounded-[16px] p-5">
            <div className="min-w-0 flex-1">
              <p className="text-soft text-[12px]">
                Harmonized hotspots, {cal.from.slice(0, 4)} to today
              </p>
              <BigNumber className="text-[40px] leading-tight">{formatCount(total)}</BigNumber>
              {current && meta && (
                <p className="text-[14px] leading-snug">
                  {formatMonth(current.month)} is <strong>{meta.phrase}</strong>
                  {current.median !== null && <> (usually {formatCount(current.median)})</>}.
                </p>
              )}
            </div>
            {meta && (
              <Mascot
                mood={meta.mood}
                label={`The mascot looks ${meta.mood}`}
                className="w-16 shrink-0 self-center"
              />
            )}
          </div>

          <dl className="divide-line grid grid-cols-3 divide-x">
            <div className="pr-3">
              <dt className="text-mute text-[11px]">Last fire</dt>
              <dd className="num mt-1 font-mono text-[14px]">
                {lastFire ? formatMonth(lastFire.month, 'short') : 'none'}
              </dd>
            </div>
            <div className="px-3">
              <dt className="text-mute text-[11px]">Peak month</dt>
              <dd className="mt-1 font-mono text-[14px]">
                {monthName(cal.peak.month_of_year, 'short')}
              </dd>
            </div>
            <div className="pl-3">
              <dt className="text-mute text-[11px]">{ys?.year} vs mean</dt>
              <dd className="mt-1 font-mono text-[14px]">
                {ys && ys.changePct !== null ? (
                  <Delta pct={ys.changePct} className="text-[14px]" />
                ) : (
                  '–'
                )}
              </dd>
            </div>
          </dl>

          <div>
            <p className="text-soft mb-2 text-[12px]">Monthly pattern (usual)</p>
            <div
              className="flex h-[96px] items-end gap-1"
              role="img"
              aria-label="Usual hotspots per month at this point"
            >
              {med.map((v, i) => (
                <span
                  key={i}
                  className="flex-1 rounded-t-[4px]"
                  style={{
                    height: `${Math.max(3, (v / maxMed) * 100)}%`,
                    background:
                      i + 1 === cal.peak.month_of_year ? 'var(--saffron)' : 'var(--coral)',
                    opacity: v ? 1 : 0.25,
                  }}
                />
              ))}
            </div>
            <div className="mt-1 flex gap-1">
              {med.map((_, i) => (
                <span key={i} className="text-mute flex-1 text-center font-mono text-[9px]">
                  {monthName(i + 1, 'narrow')}
                </span>
              ))}
            </div>
          </div>

          <div>
            <p className="text-soft mb-2 text-[12px]">Year by year</p>
            <svg
              viewBox={`0 0 ${Math.max(years.length, 1) * 10} 60`}
              preserveAspectRatio="none"
              className="h-[60px] w-full"
              role="img"
              aria-label="Hotspots per year at this point"
            >
              {years.map((y, i) => (
                <rect
                  key={y.year}
                  x={i * 10 + 1}
                  width={8}
                  y={60 - (y.hotspots / maxYear) * 58}
                  height={(y.hotspots / maxYear) * 58}
                  rx={2}
                  fill={y.year === ys?.year ? 'var(--saffron)' : 'var(--garnet)'}
                  opacity={y.complete ? 1 : 0.6}
                />
              ))}
            </svg>
            <div className="text-mute flex justify-between font-mono text-[10px]">
              <span>{years[0]?.year}</span>
              <span>{years.at(-1)?.year}</span>
            </div>
          </div>
        </>
      )}

      <div className="mt-auto flex flex-col gap-2">
        <div className="bg-card-2 rounded-[16px] p-4">
          <p className="mb-2 text-[13px] font-semibold">Download CSV</p>
          <ExportPanel
            key={`${lat},${lon},${radiusKm},${cal?.data_until}`}
            area={area}
            name={`This point, ${radiusKm} km`}
            country={country.data}
            dataUntil={cal?.data_until}
          />
        </div>
        <Link
          to={`/${search}`}
          className="bg-saffron flex h-11 items-center justify-center gap-2 rounded-full text-[14px] font-semibold text-[#100d0f]"
        >
          <LayoutDashboard className="size-5" /> Open on the dashboard map
        </Link>
        <div className="grid grid-cols-2 gap-2">
          <Link
            to={`/analysis${search}#calendar`}
            className="border-line flex h-11 items-center justify-center gap-1 rounded-full border text-[13px] font-semibold hover:bg-white/5"
          >
            <CalendarDays className="size-[18px]" /> Full analysis
          </Link>
          <Link
            to={`/analysis${search}#anomalies`}
            className="border-line flex h-11 items-center justify-center gap-1 rounded-full border text-[13px] font-semibold hover:bg-white/5"
          >
            <Waves className="size-[18px]" /> Is this normal?
          </Link>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-soft hover:text-bone flex h-9 items-center justify-center gap-1 rounded-full text-[13px]"
        >
          <MapPinOff className="size-[18px]" /> Close
        </button>
      </div>
    </aside>
  )
}
