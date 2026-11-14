import { Link, useLocation } from 'react-router'

import type { Calendar } from '@/api/types'
import { BigNumber, Card, Delta, Ring } from '@/components/card'
import { formatCount, formatMonth, monthName } from '@/lib/format'
import { heatColor } from '@/lib/heat'
import { lastMonths, monthVsLastYear, peakShare, yearSoFar } from '@/lib/insights'

const BAR_COLORS = ['var(--slate)', 'var(--saffron)', 'var(--garnet)']

/** Bottom-left of the globe: this month, the last three months, the burn calendar. */
export function MonthCards({ calendar }: { calendar: Calendar }) {
  const { search } = useLocation()
  const m = monthVsLastYear(calendar)
  const last3 = lastMonths(calendar, 3)
  const max = Math.max(...last3.months.map((x) => x.hotspots), 1)
  const total = calendar.years.reduce((s, y) => s + y.hotspots, 0)
  const n = calendar.scale.colors.length - 1
  const rows = calendar.grid.years.slice(-14)
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div className="grid min-w-0 grid-cols-1 gap-3">
        {m && (
          <Card className="p-4">
            <p className="text-soft text-[13px]">Hotspots this month</p>
            <div className="mt-1 flex items-baseline gap-2">
              <BigNumber className="text-[22px]">{formatCount(m.value)}</BigNumber>
              <Delta pct={m.changePct} />
            </div>
            <p className="text-mute font-mono text-[11px]">
              {m.previous !== null
                ? `vs ${formatCount(m.previous)} in ${formatMonth(`${Number(m.month.slice(0, 4)) - 1}${m.month.slice(4)}`, 'short')}`
                : 'first year on record'}
              {m.incomplete && ' · so far'}
            </p>
          </Card>
        )}
        <Card className="p-4">
          <p className="text-soft text-[13px]">Last three months</p>
          <div className="mt-1 flex items-baseline gap-2">
            <BigNumber className="text-[22px]">{formatCount(last3.total)}</BigNumber>
            <Delta pct={last3.changePct} />
          </div>
          <p className="text-mute font-mono text-[11px]">vs {formatCount(last3.usual)} usually</p>
          <ul className="mt-3 space-y-2.5">
            {last3.months.map((x, i) => (
              <li key={x.month}>
                <div className="flex justify-between text-[12px]">
                  <span>{monthName(x.month_of_year)}</span>
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
      </div>
      <Link to={{ pathname: '/analysis', search, hash: '#calendar' }} className="block">
        <Card className="hover:border-mute h-full p-4 transition-colors">
          <p className="text-soft text-[13px]">
            Burn calendar {calendar.grid.years[0]}–{calendar.grid.years.at(-1)}
          </p>
          <BigNumber className="mt-1 text-[22px]">{formatCount(total)}</BigNumber>
          <p className="text-mute font-mono text-[11px]">harmonized hotspots on record</p>
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
          <span className="sr-only">Open the full burning calendar</span>
        </Card>
      </Link>
    </div>
  )
}

/** Top-right of the globe: how concentrated the fire season is. */
export function SeasonPulse({ calendar }: { calendar: Calendar }) {
  const peak = peakShare(calendar, 3)
  const year = calendar.grid.years.at(-1)!
  const row = calendar.grid.values[calendar.grid.years.length - 1]
  const med = calendar.climatology.map((c) => c.median ?? 0)
  const max = Math.max(1, ...med, ...row.map((v) => v ?? 0))
  const W = 200
  const H = 48
  const line = (vals: (number | null)[]) =>
    vals
      .map((v, i) => (v === null ? null : `${(i / 11) * W},${H - (v / max) * H}`))
      .filter(Boolean)
      .join(' ')
  const ranked = calendar.climatology
    .map((c, i) => ({ m: c.month_of_year, usual: c.median ?? 0, now: row[i] }))
    .sort((a, b) => b.usual - a.usual)
    .slice(0, 9)
  const names = peak.months
    .slice()
    .sort((a, b) => a - b)
    .map((m) => monthName(m, 'short'))
  return (
    <div>
      <p className="font-semibold">Fire season pulse</p>
      <p className="text-soft mt-3 text-[13px]">Share in peak months</p>
      <BigNumber className="text-[34px] leading-tight">
        {peak.share.toFixed(1)}
        <span className="text-soft text-xl">%</span>
      </BigNumber>
      <p className="text-mute font-mono text-[10px]">of a usual year falls in {names.join(', ')}</p>
      <svg
        viewBox={`0 -4 ${W} ${H + 8}`}
        className="mt-3 h-14 w-full"
        role="img"
        aria-label={`Usual monthly pattern and ${year}`}
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
      <p className="text-mute flex gap-3 font-mono text-[10px]">
        <span className="flex items-center gap-1">
          <span className="bg-slate inline-block h-0.5 w-3" /> usual
        </span>
        <span className="flex items-center gap-1">
          <span className="bg-garnet inline-block h-0.5 w-3" /> {year}
        </span>
      </p>
      <table className="mt-3 w-full text-[11px]">
        <caption className="sr-only">Busiest months of a usual year and this year</caption>
        <thead className="sr-only">
          <tr>
            <th>Month</th>
            <th>Usual</th>
            <th>{year}</th>
          </tr>
        </thead>
        <tbody>
          {ranked.map((r) => (
            <tr key={r.m}>
              <th scope="row" className="py-[3px] text-left font-normal">
                <span
                  className="mr-2 inline-block size-1.5 rounded-full"
                  style={{ background: r.m === peak.months[0] ? 'var(--garnet)' : 'var(--coral)' }}
                />
                {monthName(r.m)}
              </th>
              <td className="text-mute num py-[3px] text-right font-mono">
                {formatCount(r.usual)}
              </td>
              <td className="num py-[3px] text-right font-mono">
                {r.now === null || r.now === undefined ? '–' : formatCount(r.now)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Bottom-right of the globe: two progress rings. */
export function ProgressRings({
  calendar,
  harmonized,
  total,
}: {
  calendar: Calendar
  harmonized?: number
  total?: number
}) {
  const y = yearSoFar(calendar)
  const complete = calendar.years.filter((x) => x.complete)
  const usualYear = complete.length
    ? complete.reduce((s, x) => s + x.hotspots, 0) / complete.length
    : 0
  return (
    <div className="space-y-4">
      {y && usualYear > 0 && (
        <div className="flex items-center gap-4">
          <Ring
            share={y.value / usualYear}
            color="var(--slate)"
            label={`${Math.round((y.value / usualYear) * 100)}% of a usual year so far`}
          />
          <div>
            <BigNumber className="text-lg">{formatCount(y.value)}</BigNumber>
            <p className="text-soft text-[13px]">of a usual year&apos;s fire, {y.year} so far</p>
          </div>
        </div>
      )}
      {harmonized !== undefined && total ? (
        <div className="flex items-center gap-4">
          <Ring
            share={harmonized / total}
            color="var(--saffron)"
            label={`${harmonized} of ${total} countries harmonized`}
          />
          <div>
            <BigNumber className="text-lg">
              {harmonized} / {total}
            </BigNumber>
            <p className="text-soft text-[13px]">countries harmonized</p>
          </div>
        </div>
      ) : null}
    </div>
  )
}
