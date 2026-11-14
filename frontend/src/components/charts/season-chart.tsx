import { useMemo, useState } from 'react'

import type { Calendar } from '@/api/types'
import { useWidth } from '@/hooks/use-size'
import { niceMax } from '@/lib/chart'
import { formatCount, monthName } from '@/lib/format'

import { ChartTooltip, YGrid } from './chart-frame'

const H = 220
const LEFT = 40
const BOTTOM = 22

/**
 * The usual season (median and middle half of past years for every month)
 * against one year: is this normal?
 */
export function SeasonChart({ calendar }: { calendar: Calendar }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const years = calendar.grid.years
  const last = years.at(-1)!
  const choices = useMemo(() => {
    const set = new Set(
      [last, last - 1, calendar.peak.busiest_year].filter((y) => years.includes(y)),
    )
    return [...set].sort((a, b) => b - a)
  }, [last, years, calendar.peak.busiest_year])
  const [year, setYear] = useState(last)
  const [hover, setHover] = useState<number | null>(null)

  const row = calendar.grid.values[years.indexOf(year)] ?? []
  const current = calendar.current
  const max = niceMax(
    Math.max(
      ...calendar.climatology.map((c) => c.p75 ?? 0),
      ...row.map((v) => v ?? 0),
      current && current.month.startsWith(String(year)) ? current.projected : 0,
    ),
  )
  const plotH = H - BOTTOM
  const x = (m: number) => LEFT + ((m - 0.5) / 12) * (width - LEFT)
  const y = (v: number) => plotH - (v / max) * plotH

  const band = calendar.climatology
    .filter((c) => c.p25 !== null && c.p75 !== null)
    .map((c) => ({ m: c.month_of_year, lo: c.p25!, hi: c.p75! }))
  const bandPath =
    band.length > 1
      ? `M${band.map((b) => `${x(b.m)},${y(b.hi)}`).join('L')}L${[...band]
          .reverse()
          .map((b) => `${x(b.m)},${y(b.lo)}`)
          .join('L')}Z`
      : ''
  const median = calendar.climatology.filter((c) => c.median !== null)
  const yearPts = row.map((v, i) => (v === null ? null : { m: i + 1, v })).filter((p) => p !== null)
  const curMonth =
    current && current.incomplete && current.month.startsWith(String(year))
      ? Number(current.month.slice(5))
      : null

  const hovered = hover ? calendar.climatology[hover - 1] : null
  const hoveredValue = hover ? row[hover - 1] : null

  return (
    <div>
      <fieldset className="mb-3 flex flex-wrap items-center gap-2">
        <legend className="sr-only">Year to compare</legend>
        {choices.map((c) => (
          <label
            key={c}
            className="border-line has-[:checked]:bg-surface-2 has-[:checked]:text-foreground text-muted-foreground cursor-pointer rounded-full border px-3 py-1 text-sm has-[:focus-visible]:outline-2"
          >
            <input
              type="radio"
              name="season-year"
              value={c}
              checked={year === c}
              onChange={() => setYear(c)}
              className="sr-only"
            />
            {c}
          </label>
        ))}
        <span className="text-muted-foreground ml-auto flex items-center gap-3 text-xs">
          <span className="flex items-center gap-1.5">
            <span className="bg-foreground/15 inline-block h-3 w-5 rounded-sm" /> Usual range
          </span>
          <span className="flex items-center gap-1.5">
            <span className="bg-muted-foreground inline-block h-0.5 w-5" /> Median
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-5" style={{ background: 'var(--accent-gold)' }} />{' '}
            {year}
          </span>
        </span>
      </fieldset>
      <div ref={ref}>
        <svg
          role="img"
          aria-label={`Typical range of each month (middle half of past years) and its median, with ${year} on top`}
          width={width}
          height={H}
          className="overflow-visible"
        >
          <YGrid max={max} width={width} height={plotH} left={LEFT} format={formatCount} />
          {bandPath && <path d={bandPath} fill="var(--foreground)" opacity={0.12} />}
          <polyline
            points={median.map((c) => `${x(c.month_of_year)},${y(c.median!)}`).join(' ')}
            fill="none"
            stroke="var(--muted-foreground)"
            strokeWidth={2}
            strokeDasharray="4 3"
          />
          <polyline
            points={yearPts
              .filter((p) => p.m !== curMonth)
              .map((p) => `${x(p.m)},${y(p.v)}`)
              .join(' ')}
            fill="none"
            stroke="var(--accent-gold)"
            strokeWidth={2.5}
            strokeLinejoin="round"
          />
          {yearPts.map((p) => (
            <circle
              key={p.m}
              cx={x(p.m)}
              cy={y(p.v)}
              r={p.m === curMonth ? 3 : 4}
              fill={p.m === curMonth ? 'var(--background)' : 'var(--accent-gold)'}
              stroke="var(--accent-gold)"
              strokeWidth={2}
            />
          ))}
          {curMonth && current && (
            <g>
              <line
                x1={x(curMonth)}
                x2={x(curMonth)}
                y1={y(current.hotspots)}
                y2={y(current.projected)}
                stroke="var(--accent-gold)"
                strokeWidth={2}
                strokeDasharray="3 3"
              />
              <circle
                cx={x(curMonth)}
                cy={y(current.projected)}
                r={4}
                fill="none"
                stroke="var(--accent-gold)"
                strokeWidth={2}
              />
            </g>
          )}
          {Array.from({ length: 12 }, (_, i) => (
            <text
              key={i}
              x={x(i + 1)}
              y={H - 6}
              textAnchor="middle"
              className="fill-[var(--muted-foreground)] text-[10px]"
            >
              {width < 480 ? monthName(i + 1, 'narrow') : monthName(i + 1, 'short')}
            </text>
          ))}
          {hover && (
            <line
              x1={x(hover)}
              x2={x(hover)}
              y1={0}
              y2={plotH}
              stroke="var(--foreground)"
              opacity={0.3}
            />
          )}
          {Array.from({ length: 12 }, (_, i) => (
            <rect
              key={i}
              data-testid="season-hit"
              tabIndex={0}
              aria-label={monthName(i + 1)}
              x={LEFT + (i / 12) * (width - LEFT)}
              y={0}
              width={(width - LEFT) / 12}
              height={plotH}
              fill="transparent"
              onMouseEnter={() => setHover(i + 1)}
              onFocus={() => setHover(i + 1)}
              onMouseLeave={() => setHover(null)}
              onBlur={() => setHover(null)}
            />
          ))}
        </svg>
      </div>
      <ChartTooltip>
        {hover && hovered ? (
          <>
            {monthName(hover)}:{' '}
            {hoveredValue === null || hoveredValue === undefined
              ? 'no data'
              : formatCount(hoveredValue)}{' '}
            in {year}
            {hover === curMonth && current
              ? ` so far (≈${formatCount(current.projected)} at this pace)`
              : ''}
            {hovered.median !== null && (
              <>
                {' '}
                · usually {formatCount(hovered.median)} (middle half {formatCount(hovered.p25 ?? 0)}
                –{formatCount(hovered.p75 ?? 0)})
              </>
            )}
          </>
        ) : (
          <span className="text-muted-foreground">Hover or focus a month for its numbers.</span>
        )}
      </ChartTooltip>
    </div>
  )
}
