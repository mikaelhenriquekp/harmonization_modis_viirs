import { ChevronRight } from 'lucide-react'
import { Link, useLocation } from 'react-router'

import type { Calendar } from '@/api/types'
import { BigNumber, Card, Delta, Ring } from '@/components/card'
import { formatCount, monthName } from '@/lib/format'
import { heatColor } from '@/lib/heat'
import { lastMonths, peakShare } from '@/lib/insights'

const BAR_COLORS = ['var(--slate)', 'var(--saffron)', 'var(--garnet)']

/** Under the headline: the last three months, and the burn calendar in miniature. */
export function MonthCards({ calendar }: { calendar: Calendar }) {
  const { search } = useLocation()
  const last3 = lastMonths(calendar, 3)
  const max = Math.max(...last3.months.map((x) => x.hotspots), 1)
  const n = calendar.scale.colors.length - 1
  const rows = calendar.grid.years.slice(-14)
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <Card className="p-4">
        <p className="text-soft text-[13px]">Last three months</p>
        <div className="mt-1 flex items-baseline gap-2">
          <BigNumber className="text-[22px]">{formatCount(last3.total)}</BigNumber>
          <Delta pct={last3.changePct} />
        </div>
        <p className="text-mute text-[12px]">usually {formatCount(last3.usual)}</p>
        <ul className="mt-4 space-y-2.5">
          {last3.months.map((x, i) => (
            <li key={x.month}>
              <div className="flex justify-between text-[12px]">
                <span>
                  {monthName(x.month_of_year)}
                  {x.incomplete && <span className="text-mute"> so far</span>}
                </span>
                <span className="num font-mono">{formatCount(x.hotspots)}</span>
              </div>
              <div className="bg-line mt-1 h-1 rounded-full">
                <div
                  className="h-1 rounded-full"
                  style={{ width: `${(x.hotspots / max) * 100}%`, background: BAR_COLORS[i] }}
                />
              </div>
            </li>
          ))}
        </ul>
      </Card>
      <Link
        to={{ pathname: '/analysis', search, hash: '#calendar' }}
        className="group block rounded-[20px]"
      >
        <Card className="group-hover:border-mute h-full p-4 transition-colors">
          <p className="text-soft flex items-center justify-between text-[13px]">
            Burn calendar
            <ChevronRight className="text-mute group-hover:text-bone size-4 transition-colors" />
          </p>
          <p className="text-mute text-[12px]">
            {calendar.grid.years[0]}–{calendar.grid.years.at(-1)}, month by month
          </p>
          <div className="mt-3 space-y-[2px]" aria-hidden>
            {rows.map((y, k) => {
              const r = calendar.grid.years.indexOf(y)
              return (
                <div key={y} className="grid grid-cols-[2rem_1fr] items-center gap-1.5">
                  <span className="text-mute font-mono text-[9px] leading-none">
                    {k % 4 === 0 || k === rows.length - 1 ? y : ''}
                  </span>
                  <div className="grid grid-cols-12 gap-[2px]">
                    {calendar.grid.classes[r].map((c, i) => (
                      <span
                        key={i}
                        className="h-2 rounded-[2px]"
                        style={{ background: c < 0 ? 'transparent' : heatColor(c, n) }}
                      />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
          <span className="sr-only">Open the full burn calendar</span>
        </Card>
      </Link>
    </div>
  )
}

/** Top-right of the globe: the usual season against this year. */
export function SeasonPulse({ calendar }: { calendar: Calendar }) {
  const peak = peakShare(calendar, 3)
  const year = calendar.grid.years.at(-1)!
  const row = calendar.grid.values[calendar.grid.years.length - 1]
  const med = calendar.climatology.map((c) => c.median ?? 0)
  const max = Math.max(1, ...med, ...row.map((v) => v ?? 0))
  const W = 240
  const H = 72
  const line = (vals: (number | null)[]) =>
    vals
      .map((v, i) => (v === null ? null : `${(i / 11) * W},${H - (v / max) * H}`))
      .filter(Boolean)
      .join(' ')
  const names = peak.months
    .slice()
    .sort((a, b) => a - b)
    .map((m) => monthName(m, 'short'))
  return (
    <div>
      <p className="font-semibold">Fire season</p>
      <p className="text-soft mt-1 text-[13px] leading-snug">
        {names.join(', ')} usually hold{' '}
        <span className="text-bone num font-mono">{Math.round(peak.share)}%</span> of the
        year&apos;s fire.
      </p>
      <svg
        viewBox={`0 -4 ${W} ${H + 8}`}
        className="mt-4 h-24 w-full"
        role="img"
        aria-label={`Hotspots per month: a usual year and ${year}`}
      >
        <polyline
          points={line(med)}
          fill="none"
          stroke="var(--slate)"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <polyline
          points={line(row)}
          fill="none"
          stroke="var(--garnet)"
          strokeWidth="2"
          strokeLinejoin="round"
        />
      </svg>
      <div className="text-mute mt-1 flex justify-between font-mono text-[10px]" aria-hidden>
        <span>Jan</span>
        <span>Jun</span>
        <span>Dec</span>
      </div>
      <p className="text-soft mt-3 flex gap-4 text-[12px]">
        <span className="flex items-center gap-1.5">
          <span className="bg-slate inline-block h-0.5 w-3" /> Usual year
        </span>
        <span className="flex items-center gap-1.5">
          <span className="bg-garnet inline-block h-0.5 w-3" /> {year}
        </span>
      </p>
    </div>
  )
}

/** Bottom-right of the globe: how much of the world the method covers. */
export function Coverage({ harmonized, total }: { harmonized: number; total: number }) {
  const { search } = useLocation()
  return (
    <Link
      to={{ pathname: '/method', search }}
      className="group flex items-center gap-4 rounded-[20px]"
    >
      <Ring
        share={harmonized / total}
        color="var(--saffron)"
        label={`${harmonized} of ${total} countries harmonized`}
      />
      <div>
        <BigNumber className="text-lg">
          {harmonized} / {total}
        </BigNumber>
        <p className="text-soft group-hover:text-bone flex items-center gap-0.5 text-[13px] transition-colors">
          countries harmonized <ChevronRight className="size-3.5" />
        </p>
      </div>
    </Link>
  )
}
