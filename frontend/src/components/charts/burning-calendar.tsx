import { useMemo, useState } from 'react'

import type { Calendar, MonthStat } from '@/api/types'
import { formatCount, formatMonth, formatSignedPct, monthName } from '@/lib/format'
import { heatColor } from '@/lib/heat'
import { cn } from '@/lib/utils'

function describe(m: MonthStat): string {
  const parts = [
    `${formatMonth(m.month)}: ${formatCount(m.hotspots)} hotspots${m.incomplete ? ' so far' : ''}`,
  ]
  if (m.anomaly_pct !== null)
    parts.push(`${formatSignedPct(m.anomaly_pct)} vs the usual ${monthName(m.month_of_year)}`)
  if (m.estimated) parts.push('estimated from MODIS')
  if (m.provisional) parts.push('provisional')
  return parts.join(', ')
}

/** Cells hatched where the value is an estimate from MODIS (before 2012-02). */
const HATCH =
  'repeating-linear-gradient(135deg, rgb(255 255 255 / 0.28) 0 1.5px, transparent 1.5px 5px)'

/** The burning calendar: one row per year, one column per month. */
export function BurningCalendar({
  calendar,
  className,
}: {
  calendar: Calendar
  className?: string
}) {
  const [table, setTable] = useState(false)
  const [active, setActive] = useState<MonthStat | null>(null)
  const n = calendar.scale.colors.length - 1
  const byKey = useMemo(
    () => new Map(calendar.months.map((m) => [`${m.year}-${m.month_of_year}`, m])),
    [calendar],
  )
  const current = calendar.current?.month
  const shown = active ?? calendar.months.find((m) => m.month === current) ?? calendar.months.at(-1)

  return (
    <div className={className}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <Legend calendar={calendar} />
        <button
          type="button"
          onClick={() => setTable((t) => !t)}
          className="text-muted-foreground hover:text-foreground text-sm underline underline-offset-4"
        >
          {table ? 'View as calendar' : 'View as table'}
        </button>
      </div>

      {table ? (
        <CalendarTable calendar={calendar} />
      ) : (
        <>
          <div
            role="grid"
            aria-label="Harmonized hotspots per month"
            className="grid gap-[3px]"
            style={{ gridTemplateColumns: '2.6rem repeat(12, minmax(0, 1fr))' }}
          >
            <div role="row" className="contents">
              <div />
              {Array.from({ length: 12 }, (_, i) => (
                <div
                  key={i}
                  role="columnheader"
                  aria-label={monthName(i + 1)}
                  className="text-muted-foreground pb-1 text-center text-[11px]"
                >
                  <span className="sm:hidden">{monthName(i + 1, 'narrow')}</span>
                  <span className="hidden sm:inline">{monthName(i + 1, 'short')}</span>
                </div>
              ))}
            </div>
            {calendar.grid.years.map((y) => (
              <div role="row" key={y} className="contents">
                <div
                  role="rowheader"
                  className={cn(
                    'text-muted-foreground tabular flex items-center pr-1 text-[11px]',
                    y === 2012 && 'text-foreground font-medium',
                  )}
                >
                  {y}
                </div>
                {Array.from({ length: 12 }, (_, i) => {
                  const m = byKey.get(`${y}-${i + 1}`)
                  if (!m) return <div key={i} aria-hidden />
                  return (
                    <div
                      key={i}
                      role="gridcell"
                      tabIndex={0}
                      aria-label={describe(m)}
                      onMouseEnter={() => setActive(m)}
                      onFocus={() => setActive(m)}
                      onMouseLeave={() => setActive(null)}
                      className={cn(
                        'relative h-5 rounded-[4px] outline-offset-1 sm:h-6',
                        m.month === current && 'ring-gold ring-2',
                        active?.month === m.month && 'ring-foreground ring-2',
                      )}
                      style={{
                        backgroundColor: heatColor(m.class, n),
                        backgroundImage: m.estimated ? HATCH : undefined,
                      }}
                    >
                      {m.provisional && (
                        <span
                          aria-hidden
                          className="bg-foreground absolute top-0.5 right-0.5 size-1 rounded-full"
                        />
                      )}
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
          {shown && (
            <p aria-live="polite" className="text-ink-2 tabular mt-3 min-h-10 text-sm">
              {describe(shown)}
              {shown.median_same_month !== null && (
                <>
                  {' '}
                  · the usual {monthName(shown.month_of_year)} has{' '}
                  {formatCount(shown.median_same_month)}
                </>
              )}
            </p>
          )}
          <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
            Hatched months (up to January 2012) are estimates rebuilt from MODIS Aqua; from February
            2012 they are VIIRS observations. A dot marks provisional near real time data; the gold
            outline is the current month.
          </p>
        </>
      )}
    </div>
  )
}

function Legend({ calendar }: { calendar: Calendar }) {
  const { breaks, colors } = calendar.scale
  const n = colors.length - 1
  const labels = Array.from({ length: n }, (_, i) => {
    const lo = i === 0 ? 0 : breaks[i - 1]
    const hi = breaks[i]
    if (hi === undefined) return `> ${formatCount(lo)}`
    return i === 0 ? `≤ ${formatCount(hi)}` : `${formatCount(lo)}–${formatCount(hi)}`
  })
  return (
    <ul
      aria-label="Color legend, hotspots per month"
      className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]"
    >
      <li className="flex items-center gap-1.5">
        <span className="size-3 rounded-[3px]" style={{ background: heatColor(0, n) }} />
        <span className="text-muted-foreground">No hotspots</span>
      </li>
      {labels.map((l, i) => (
        <li key={l} className="flex items-center gap-1.5">
          <span className="size-3 rounded-[3px]" style={{ background: heatColor(i + 1, n) }} />
          <span className="text-muted-foreground tabular">{l}</span>
        </li>
      ))}
    </ul>
  )
}

function CalendarTable({ calendar }: { calendar: Calendar }) {
  return (
    <div className="border-line overflow-x-auto rounded-lg border">
      <table className="tabular w-full min-w-[640px] text-right text-xs">
        <caption className="sr-only">Harmonized hotspots per month, one row per year</caption>
        <thead className="text-muted-foreground">
          <tr>
            <th scope="col" className="px-2 py-1.5 text-left font-medium">
              Year
            </th>
            {Array.from({ length: 12 }, (_, i) => (
              <th key={i} scope="col" className="px-2 py-1.5 font-medium">
                {monthName(i + 1, 'short')}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {calendar.grid.years.map((y, r) => (
            <tr key={y} className="border-line border-t">
              <th scope="row" className="px-2 py-1 text-left font-medium">
                {y}
              </th>
              {calendar.grid.values[r].map((v, i) => (
                <td key={i} className="px-2 py-1">
                  {v === null ? '' : formatCount(v)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
