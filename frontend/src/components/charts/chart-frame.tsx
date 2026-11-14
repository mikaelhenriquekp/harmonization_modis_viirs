import type { ReactNode } from 'react'

import { ticks } from '@/lib/chart'

/** Recessive horizontal grid with labels on the left. */
export function YGrid({
  max,
  width,
  height,
  left,
  format,
}: {
  max: number
  width: number
  height: number
  left: number
  format: (v: number) => string
}) {
  return (
    <g aria-hidden>
      {ticks(max).map((t) => {
        const y = height - (t / max) * height
        return (
          <g key={t}>
            <line x1={left} x2={width} y1={y} y2={y} stroke="var(--line)" />
            <text
              x={left - 6}
              y={y}
              dy="0.32em"
              textAnchor="end"
              className="fill-[var(--muted-foreground)] text-[10px]"
            >
              {format(t)}
            </text>
          </g>
        )
      })}
    </g>
  )
}

export function ChartTooltip({ children }: { children: ReactNode }) {
  return (
    <p aria-live="polite" className="text-ink-2 tabular mt-2 min-h-5 text-sm">
      {children}
    </p>
  )
}

/** Diagonal texture for estimated values (also readable without color). */
export function HatchPattern({ id }: { id: string }) {
  return (
    <defs>
      <pattern
        id={id}
        width="5"
        height="5"
        patternUnits="userSpaceOnUse"
        patternTransform="rotate(45)"
      >
        <line
          x1="0"
          y1="0"
          x2="0"
          y2="5"
          stroke="var(--background)"
          strokeWidth="2"
          opacity="0.55"
        />
      </pattern>
    </defs>
  )
}
