import { useId, useState } from 'react'

import type { Calendar } from '@/api/types'
import { ChartTooltip, YGrid } from '@/components/charts/chart-frame'
import { useWidth } from '@/hooks/use-size'
import { niceMax } from '@/lib/chart'
import { formatCount, formatMonth, monthName } from '@/lib/format'
import { statusMeta } from '@/lib/status'

const H = 230
const LEFT = 34
const BOTTOM = 22

/** The usual range of every month (boxes), its median (bars) and a year on top. */
export function NormalChart({ calendar }: { calendar: Calendar }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const years = calendar.grid.years
  const [year, setYear] = useState(years.at(-1)!)
  const [hover, setHover] = useState<number | null>(null)
  const selectId = useId()
  const row = calendar.grid.values[years.indexOf(year)] ?? []
  const cur = calendar.current
  const curMonth =
    cur && cur.incomplete && cur.month.startsWith(String(year)) ? Number(cur.month.slice(5)) : null
  const clim = calendar.climatology
  const max = niceMax(
    Math.max(
      1,
      ...clim.map((c) => c.p75 ?? 0),
      ...row.map((v) => v ?? 0),
      curMonth && cur ? cur.projected : 0,
    ),
  )
  const plotH = H - BOTTOM
  const slot = (width - LEFT) / 12
  const x = (m: number) => LEFT + (m - 0.5) * slot
  const y = (v: number) => plotH - (v / max) * plotH
  const pts = row.map((v, i) => (v === null ? null : { m: i + 1, v })).filter((p) => p !== null)
  const meta = cur ? statusMeta(cur.status) : null

  // callout on the month that stands out most against its median
  const callout = pts
    .map((p) => {
      const med = clim[p.m - 1]?.median ?? 0
      const v = p.m === curMonth && cur ? cur.projected : p.v
      return { ...p, v, ratio: med > 0 ? v / med : 0 }
    })
    .sort((a, b) => b.ratio - a.ratio)[0]

  return (
    <div>
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h3 className="text-[20px] leading-tight font-semibold">
            {cur && meta ? `${formatMonth(cur.month)} ${meta.phrase}` : 'The usual season'}
          </h3>
          <p className="text-soft mt-1 text-[13px]">
            Usual range (middle half of past years), median and selected year
          </p>
        </div>
        <label
          htmlFor={selectId}
          className="text-soft flex shrink-0 items-center gap-2 text-[13px]"
        >
          Year
          <select
            id={selectId}
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="bg-card-2 border-line text-bone rounded-full border px-3 py-1.5 font-mono"
          >
            {[...years].reverse().map((y) => (
              <option key={y}>{y}</option>
            ))}
          </select>
        </label>
      </div>
      <div ref={ref}>
        <svg
          role="img"
          aria-label={`Usual range of each month and its median, with ${year} on top`}
          width={width}
          height={H}
          className="overflow-visible"
        >
          <YGrid max={max} width={width} height={plotH} left={LEFT} format={formatCount} />
          {clim.map((c) => {
            const bw = Math.min(26, slot * 0.55)
            const cx = x(c.month_of_year)
            return (
              <g key={c.month_of_year}>
                {c.p25 !== null && c.p75 !== null && (
                  <rect
                    x={cx - bw / 2 - 3}
                    width={bw + 6}
                    y={y(c.p75)}
                    height={Math.max(2, y(c.p25) - y(c.p75))}
                    rx={3}
                    fill="rgba(240,192,72,0.12)"
                    stroke="rgba(240,192,72,0.35)"
                  />
                )}
                {c.median !== null && (
                  <rect
                    x={cx - bw / 2}
                    width={bw}
                    y={y(c.median)}
                    height={plotH - y(c.median)}
                    rx={3}
                    fill="var(--card-2)"
                    stroke="var(--line)"
                  />
                )}
                <text
                  x={cx}
                  y={H - 6}
                  textAnchor="middle"
                  className="fill-[var(--mute)] font-mono text-[10px]"
                >
                  {width < 480
                    ? monthName(c.month_of_year, 'narrow')
                    : monthName(c.month_of_year, 'short')}
                </text>
              </g>
            )
          })}
          <polyline
            points={pts
              .filter((p) => p.m !== curMonth)
              .map((p) => `${x(p.m)},${y(p.v)}`)
              .join(' ')}
            fill="none"
            stroke="var(--saffron)"
            strokeWidth={2}
            strokeLinejoin="round"
          />
          {pts.map((p) => (
            <circle
              key={p.m}
              cx={x(p.m)}
              cy={y(p.v)}
              r={4}
              fill={p.m === curMonth ? 'var(--bg)' : 'var(--saffron)'}
              stroke="var(--saffron)"
              strokeWidth={2}
            />
          ))}
          {curMonth && cur && (
            <>
              <line
                x1={x(curMonth)}
                x2={x(curMonth)}
                y1={y(cur.hotspots)}
                y2={y(cur.projected)}
                stroke="var(--saffron)"
                strokeWidth={2}
                strokeDasharray="3 3"
              />
              <circle cx={x(curMonth)} cy={y(cur.projected)} r={4} fill="var(--saffron)" />
            </>
          )}
          {callout && callout.ratio >= 1.5 && (
            <g>
              <line
                x1={x(callout.m)}
                y1={y(callout.v)}
                x2={x(callout.m) + 14}
                y2={y(callout.v) - 22}
                stroke="var(--soft)"
              />
              <text
                x={x(callout.m) + 16}
                y={y(callout.v) - 26}
                className="fill-[var(--bone)] font-mono text-[11px]"
              >
                {monthName(callout.m, 'short')}: {callout.ratio.toFixed(1)}× usual
              </text>
            </g>
          )}
          {Array.from({ length: 12 }, (_, i) => (
            <rect
              key={i}
              x={LEFT + i * slot}
              y={0}
              width={slot}
              height={plotH}
              fill="transparent"
              tabIndex={0}
              aria-label={monthName(i + 1)}
              onMouseEnter={() => setHover(i + 1)}
              onFocus={() => setHover(i + 1)}
              onMouseLeave={() => setHover(null)}
              onBlur={() => setHover(null)}
            />
          ))}
        </svg>
      </div>
      <div className="text-soft mt-3 flex flex-wrap gap-4 text-[12px]">
        <span className="flex items-center gap-1.5">
          <span className="inline-block size-3 rounded-[3px] border border-[rgba(240,192,72,0.35)] bg-[rgba(240,192,72,0.12)]" />{' '}
          Usual range
        </span>
        <span className="flex items-center gap-1.5">
          <span className="bg-card-2 border-line inline-block size-3 rounded-[3px] border" /> Median
        </span>
        <span className="flex items-center gap-1.5">
          <span className="bg-saffron inline-block h-0.5 w-4" /> {year}
        </span>
      </div>
      <ChartTooltip>
        {hover ? (
          <>
            {monthName(hover)} {year}:{' '}
            {row[hover - 1] === null || row[hover - 1] === undefined
              ? 'no data'
              : formatCount(row[hover - 1]!)}
            {hover === curMonth && cur
              ? ` so far (≈${formatCount(cur.projected)} at this pace)`
              : ''}
            {clim[hover - 1].median !== null && (
              <>
                {' '}
                · usually {formatCount(clim[hover - 1].median!)} (
                {formatCount(clim[hover - 1].p25 ?? 0)}–{formatCount(clim[hover - 1].p75 ?? 0)})
              </>
            )}
          </>
        ) : (
          <span className="text-mute">Hover or focus a month for its numbers.</span>
        )}
      </ChartTooltip>
    </div>
  )
}
