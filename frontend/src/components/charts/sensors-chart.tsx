import { useMemo, useState } from 'react'

import type { SensorsResponse } from '@/api/types'
import { useWidth } from '@/hooks/use-size'
import { niceMax, spreadLabels } from '@/lib/chart'
import { SERIES, annualTotals, type YearRow } from '@/lib/sensors'
import { formatCount } from '@/lib/format'

import { ChartTooltip, YGrid } from './chart-frame'

const H = 240
const LEFT = 44
const BOTTOM = 22

/** Why the record needs harmonizing: the raw sensors next to the harmonized series. */
export function SensorsChart({ data }: { data: SensorsResponse }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [table, setTable] = useState(false)
  const [hover, setHover] = useState<YearRow | null>(null)
  const rows = useMemo(() => annualTotals(data), [data])
  const present = SERIES.filter((s) => rows.some((r) => r[s.key] > 0))
  const max = niceMax(Math.max(1, ...rows.flatMap((r) => present.map((s) => r[s.key]))))
  const plotH = H - BOTTOM
  const ends = width >= 520
  const right = ends ? 92 : 12
  const x = (i: number) => LEFT + (i / Math.max(rows.length - 1, 1)) * (width - LEFT - right)
  const y = (v: number) => plotH - (v / max) * plotH
  const labelYs = spreadLabels(
    present.map((s) => {
      const last = [...rows].reverse().find((r) => r[s.key] > 0)
      return last ? y(last[s.key]) : plotH
    }),
    14,
  )

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs" aria-label="Legend">
          {present.map((s) => (
            <li key={s.key} className="text-muted-foreground flex items-center gap-1.5">
              <span
                className="inline-block h-0.5 w-5"
                style={{ background: s.color, height: s.width }}
              />
              {s.label}
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() => setTable((t) => !t)}
          className="text-muted-foreground hover:text-foreground text-sm underline underline-offset-4"
        >
          {table ? 'View as chart' : 'View as table'}
        </button>
      </div>
      {table ? (
        <div className="border-line overflow-x-auto rounded-lg border">
          <table className="tabular w-full text-right text-xs">
            <caption className="sr-only">Hotspots per year by sensor</caption>
            <thead className="text-muted-foreground">
              <tr>
                <th scope="col" className="px-2 py-1.5 text-left font-medium">
                  Year
                </th>
                {present.map((s) => (
                  <th key={s.key} scope="col" className="px-2 py-1.5 font-medium">
                    {s.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.year} className="border-line border-t">
                  <th scope="row" className="px-2 py-1 text-left font-medium">
                    {r.year}
                  </th>
                  {present.map((s) => (
                    <td key={s.key} className="px-2 py-1">
                      {r[s.key] ? formatCount(r[s.key]) : '–'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div ref={ref}>
          <svg
            role="img"
            aria-label="Hotspots per year: raw MODIS Aqua, Suomi NPP and NOAA-20 next to the harmonized series"
            width={width}
            height={H}
            className="overflow-visible"
          >
            <YGrid
              max={max}
              width={width - right}
              height={plotH}
              left={LEFT}
              format={formatCount}
            />
            {present.map((s, k) => {
              const pts = rows.map((r, i) => ({ i, v: r[s.key] })).filter((p) => p.v > 0)
              if (!pts.length) return null
              const labelY = labelYs[k]
              return (
                <g key={s.key}>
                  <polyline
                    points={pts.map((p) => `${x(p.i)},${y(p.v)}`).join(' ')}
                    fill="none"
                    stroke={s.color}
                    strokeWidth={s.width}
                    strokeLinejoin="round"
                    strokeDasharray={s.key === 'harmonized' ? undefined : '0'}
                  />
                  {ends && (
                    <text
                      x={x(rows.length - 1) + 8}
                      y={labelY}
                      dy="0.32em"
                      className="fill-[var(--ink-2)] text-[11px]"
                    >
                      {s.label}
                    </text>
                  )}
                </g>
              )
            })}
            {rows.map((r, i) =>
              i % (width < 520 ? 5 : 2) === 0 || i === rows.length - 1 ? (
                <text
                  key={r.year}
                  x={x(i)}
                  y={H - 6}
                  textAnchor="middle"
                  className="fill-[var(--muted-foreground)] text-[10px]"
                >
                  {r.year}
                </text>
              ) : null,
            )}
            {hover && (
              <line
                x1={x(rows.indexOf(hover))}
                x2={x(rows.indexOf(hover))}
                y1={0}
                y2={plotH}
                stroke="var(--foreground)"
                opacity={0.3}
              />
            )}
            {rows.map((r, i) => (
              <rect
                key={r.year}
                x={x(i) - (width - LEFT - right) / Math.max(rows.length - 1, 1) / 2}
                y={0}
                width={(width - LEFT - right) / Math.max(rows.length - 1, 1)}
                height={plotH}
                fill="transparent"
                tabIndex={0}
                aria-label={String(r.year)}
                onMouseEnter={() => setHover(r)}
                onFocus={() => setHover(r)}
                onMouseLeave={() => setHover(null)}
                onBlur={() => setHover(null)}
              />
            ))}
          </svg>
        </div>
      )}
      {!table && (
        <ChartTooltip>
          {hover ? (
            <>
              {hover.year}:{' '}
              {present
                .map((s) => `${s.label} ${hover[s.key] ? formatCount(hover[s.key]) : '–'}`)
                .join(' · ')}
            </>
          ) : (
            <span className="text-muted-foreground">Point at a year for its numbers.</span>
          )}
        </ChartTooltip>
      )}
    </div>
  )
}
