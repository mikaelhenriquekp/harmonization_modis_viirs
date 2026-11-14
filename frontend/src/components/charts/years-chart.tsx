import { useState } from 'react'

import type { Calendar, YearStat } from '@/api/types'
import { useWidth } from '@/hooks/use-size'
import { niceMax } from '@/lib/chart'
import { formatCount } from '@/lib/format'

import { ChartTooltip, HatchPattern, YGrid } from './chart-frame'

const H = 200
const LEFT = 40
const BOTTOM = 22
const TOP = 16

/** Hotspots per year, the busiest labelled with their rank. */
export function YearsChart({ calendar }: { calendar: Calendar }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<YearStat | null>(null)
  const years = calendar.years
  const max = niceMax(Math.max(...years.map((y) => y.hotspots)))
  const plotH = H - BOTTOM - TOP
  const slot = (width - LEFT) / Math.max(years.length, 1)
  const barW = Math.max(3, slot - 2) // 2px gap between bars
  const firstVIIRS = 2012
  const labelEvery = width < 520 ? 5 : 2

  return (
    <div>
      <div ref={ref}>
        <svg
          role="img"
          aria-label="Harmonized hotspots per year; complete years ranked"
          width={width}
          height={H}
          className="overflow-visible"
        >
          <HatchPattern id="years-hatch" />
          <g transform={`translate(0,${TOP})`}>
            <YGrid max={max} width={width} height={plotH} left={LEFT} format={formatCount} />
            {years.map((y, i) => {
              const h = (y.hotspots / max) * plotH
              const x = LEFT + i * slot + 1
              const top3 = y.rank !== null && y.rank <= 3
              const fill = top3 ? 'var(--heat-4)' : 'var(--ink-2)'
              return (
                <g key={y.year} opacity={y.complete ? 1 : 0.55}>
                  <path
                    d={`M${x},${plotH} V${plotH - h + Math.min(4, h)} q0,-4 4,-4 H${x + barW - 4} q4,0 4,4 V${plotH} Z`}
                    fill={fill}
                    fillOpacity={top3 ? 1 : 0.35}
                  />
                  {y.year < firstVIIRS && (
                    <path
                      d={`M${x},${plotH} V${plotH - h} H${x + barW} V${plotH} Z`}
                      fill="url(#years-hatch)"
                    />
                  )}
                  {top3 && (
                    <text
                      x={x + barW / 2}
                      y={plotH - h - 4}
                      textAnchor="middle"
                      className="fill-[var(--foreground)] text-[10px] font-semibold"
                    >
                      #{y.rank}
                    </text>
                  )}
                  {(i % labelEvery === 0 || i === years.length - 1) && (
                    <text
                      x={x + barW / 2}
                      y={plotH + 15}
                      textAnchor="middle"
                      className="fill-[var(--muted-foreground)] text-[10px]"
                    >
                      {y.year}
                    </text>
                  )}
                  <rect
                    x={x - 1}
                    y={0}
                    width={slot}
                    height={plotH}
                    fill="transparent"
                    tabIndex={0}
                    aria-label={`${y.year}: ${formatCount(y.hotspots)} hotspots`}
                    onMouseEnter={() => setHover(y)}
                    onFocus={() => setHover(y)}
                    onMouseLeave={() => setHover(null)}
                    onBlur={() => setHover(null)}
                  />
                </g>
              )
            })}
          </g>
        </svg>
      </div>
      <ChartTooltip>
        {hover ? (
          <>
            {hover.year}: {formatCount(hover.hotspots)} hotspots
            {!hover.complete && ` so far (${hover.months} months)`}
            {hover.rank !== null &&
              `, #${hover.rank} of ${years.filter((y) => y.complete).length} complete years`}
            {hover.year < firstVIIRS && ' · estimated from MODIS'}
          </>
        ) : (
          <span className="text-muted-foreground">
            Hatched years are estimated from MODIS; the faded bar is the current year so far.
          </span>
        )}
      </ChartTooltip>
    </div>
  )
}
