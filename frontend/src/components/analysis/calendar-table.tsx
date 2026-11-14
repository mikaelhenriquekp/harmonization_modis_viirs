import { Check } from 'lucide-react'
import { useMemo, useState } from 'react'

import type { Calendar, MonthStat } from '@/api/types'
import { formatCount, formatMonth, formatSignedPct, monthName } from '@/lib/format'
import { ANOMALY_COLOR, anomalyClass, heatColor, heatInk } from '@/lib/heat'
import { STATUS_ORDER, statusMeta } from '@/lib/status'
import { cn } from '@/lib/utils'

type Mode = 'count' | 'anomaly'

function describe(m: MonthStat, current: boolean): string {
  const parts = [
    `${formatMonth(m.month)}: ${formatCount(m.hotspots)} hotspots${m.incomplete ? ' so far' : ''}`,
  ]
  if (m.anomaly_pct !== null)
    parts.push(`${formatSignedPct(m.anomaly_pct)} vs the usual ${monthName(m.month_of_year)}`)
  if (m.estimated) parts.push('estimated from MODIS')
  if (m.provisional) parts.push('provisional')
  if (current) parts.push('current month')
  return parts.join(', ')
}

const ANOM_TEXT: Record<string, string> = {
  much_above: 'var(--on-accent)',
  much_below: 'var(--on-accent)',
}

/** The burning calendar as in the wireframe: a table of years and months. */
export function CalendarTable({ calendar }: { calendar: Calendar }) {
  const [mode, setMode] = useState<Mode>('count')
  const n = calendar.scale.colors.length - 1
  const byKey = useMemo(
    () => new Map(calendar.months.map((m) => [`${m.year}-${m.month_of_year}`, m])),
    [calendar],
  )
  const years = [...calendar.grid.years].reverse()
  const totals = new Map(calendar.years.map((y) => [y.year, y]))
  const maxTotal = Math.max(1, ...calendar.years.map((y) => y.hotspots))
  const current = calendar.current?.month

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <fieldset className="flex gap-1.5">
          <legend className="sr-only">Color by</legend>
          {(
            [
              ['count', 'Hotspot count'],
              ['anomaly', 'Anomaly'],
            ] as const
          ).map(([v, label]) => (
            <label
              key={v}
              className={cn(
                'flex cursor-pointer items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[13px] font-semibold has-[:focus-visible]:outline-2',
                mode === v
                  ? 'border-coral bg-coral text-[#100d0f]'
                  : 'border-line hover:bg-white/5',
              )}
            >
              <input
                type="radio"
                name="calendar-mode"
                className="sr-only"
                checked={mode === v}
                onChange={() => setMode(v)}
              />
              {mode === v && <Check className="size-3.5" aria-hidden />}
              {label}
            </label>
          ))}
        </fieldset>
        <Legend calendar={calendar} mode={mode} />
      </div>

      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <table className="num w-full min-w-[760px] border-separate border-spacing-[3px] font-mono text-[11px]">
          <caption className="sr-only">
            Harmonized hotspots per month, one row per year, newest first
          </caption>
          <thead>
            <tr className="text-mute">
              <th scope="col" className="w-12 font-normal">
                <span className="sr-only">Year</span>
              </th>
              {Array.from({ length: 12 }, (_, i) => (
                <th key={i} scope="col" className="pb-1 font-normal" aria-label={monthName(i + 1)}>
                  {monthName(i + 1, 'short')}
                </th>
              ))}
              <th scope="col" className="w-24 pb-1 text-right font-normal">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {years.map((y) => {
              const t = totals.get(y)
              return (
                <tr key={y}>
                  <th
                    scope="row"
                    className={cn(
                      'pr-1 text-left font-normal',
                      y === Number(current?.slice(0, 4)) ? 'text-bone font-semibold' : 'text-soft',
                    )}
                  >
                    <span className="flex items-center gap-1.5">
                      {y === Number(current?.slice(0, 4)) && (
                        <span className="bg-saffron size-1.5 rounded-full" aria-hidden />
                      )}
                      {y}
                    </span>
                  </th>
                  {Array.from({ length: 12 }, (_, i) => {
                    const m = byKey.get(`${y}-${i + 1}`)
                    if (!m) return <td key={i} aria-hidden />
                    const isCurrent = m.month === current
                    const status = anomalyClass(m.percentile)
                    const bg = mode === 'count' ? heatColor(m.class, n) : ANOMALY_COLOR[status]
                    const ink =
                      mode === 'count' ? heatInk(m.class, n) : (ANOM_TEXT[status] ?? 'var(--bone)')
                    return (
                      <td
                        key={i}
                        aria-label={describe(m, isCurrent)}
                        className={cn(
                          'relative h-7 rounded-[4px] text-center',
                          m.estimated && 'hatch',
                          mode === 'count' && status === 'much_above' && !m.incomplete && 'tri',
                          isCurrent && 'outline-saffron outline-2 -outline-offset-2',
                        )}
                        style={{ backgroundColor: bg, color: ink }}
                        title={describe(m, isCurrent)}
                      >
                        {formatCount(m.hotspots)}
                      </td>
                    )
                  })}
                  <td className="pl-2">
                    <span className="flex items-center justify-end gap-2">
                      <span className="bg-line hidden h-1 w-10 rounded-full sm:block">
                        <span
                          className="bg-soft block h-1 rounded-full"
                          style={{ width: `${((t?.hotspots ?? 0) / maxTotal) * 100}%` }}
                        />
                      </span>
                      {t ? formatCount(t.hotspots) : ''}
                    </span>
                  </td>
                </tr>
              )
            })}
            <tr>
              <th scope="row" className="text-soft pt-2 text-left font-normal">
                Mean
              </th>
              {calendar.climatology.map((c) => (
                <td key={c.month_of_year} className="text-soft pt-2 text-center">
                  {c.mean === null ? '' : formatCount(c.mean)}
                </td>
              ))}
              <td />
            </tr>
          </tbody>
        </table>
      </div>
      <p className="text-mute mt-4 font-mono text-[11px] leading-relaxed">
        Unit: harmonized hotspots (VIIRS 375 m equivalent). Hatched months, up to January 2012, are
        rebuilt from MODIS Aqua. Color breaks use quantiles for this area; a corner mark flags
        months far above their usual value.
      </p>
    </div>
  )
}

function Legend({ calendar, mode }: { calendar: Calendar; mode: Mode }) {
  if (mode === 'anomaly') {
    return (
      <ul className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]" aria-label="Legend">
        {STATUS_ORDER.filter((s) => s !== 'no_history').map((s) => (
          <li key={s} className="text-soft flex items-center gap-1.5">
            <span className="size-3 rounded-[3px]" style={{ background: ANOMALY_COLOR[s] }} />
            {statusMeta(s).label.replace(' normal', '').replace('Normal', 'Usual')}
          </li>
        ))}
      </ul>
    )
  }
  const { breaks, colors } = calendar.scale
  const n = colors.length - 1
  return (
    <div className="flex flex-wrap items-center gap-4 text-[11px]">
      <div className="flex items-center gap-2">
        <span className="text-soft">Hotspots / month</span>
        <ul className="flex" aria-label="Color legend">
          <li className="flex flex-col items-center gap-0.5">
            <span className="h-2.5 w-7 rounded-l-[3px]" style={{ background: heatColor(0, n) }} />
            <span className="text-mute font-mono text-[9px]">0</span>
          </li>
          {Array.from({ length: n }, (_, i) => (
            <li key={i} className="flex flex-col items-center gap-0.5">
              <span
                className={cn('h-2.5 w-7', i === n - 1 && 'rounded-r-[3px]')}
                style={{ background: heatColor(i + 1, n) }}
              />
              <span className="text-mute font-mono text-[9px]">
                {breaks[i] !== undefined
                  ? `≤${formatCount(breaks[i])}`
                  : `>${formatCount(breaks[i - 1] ?? 0)}`}
              </span>
            </li>
          ))}
        </ul>
      </div>
      <span className="text-soft tri relative pr-3" style={{ color: 'var(--garnet)' }}>
        <span className="text-soft">Far above usual</span>
      </span>
      <span className="text-soft flex items-center gap-1.5">
        <span className="outline-saffron size-3 rounded-[3px] outline-2" /> Current month
      </span>
    </div>
  )
}
