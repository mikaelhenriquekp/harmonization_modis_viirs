import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useRef, type KeyboardEvent, type PointerEvent } from 'react'

import type { MonthStat } from '@/api/types'
import { formatCount, formatMonth, formatSignedPct } from '@/lib/format'
import { ANOMALY_COLOR, anomalyClass } from '@/lib/heat'
import { cn } from '@/lib/utils'

const HEIGHT = 40

/** What the slider says about a month, for the label and for screen readers. */
function monthText(m: MonthStat): string {
  const vs = m.anomaly_pct !== null ? `, ${formatSignedPct(m.anomaly_pct)} vs usual` : ''
  const partial = m.incomplete ? ' so far' : ''
  return `${formatMonth(m.month)}: ${formatCount(m.hotspots)} hotspots${partial}${vs}`
}

/** The colour of a month's bar: how unusual it was, or quiet grey when normal. */
function barColor(m: MonthStat): string {
  const s = anomalyClass(m.percentile)
  if (s === 'normal' || s === 'no_history') return 'var(--mute)'
  return ANOMALY_COLOR[s]
}

interface MonthTimelineProps {
  months: MonthStat[]
  /** The chosen month, YYYY-MM. */
  value: string
  onChange: (month: string) => void
  className?: string
}

/**
 * Every month of the record as one bar, height by hotspots and colour by how
 * unusual the month was. A slider: drag, tap, or use the arrow keys.
 */
export function MonthTimeline({ months, value, onChange, className }: MonthTimelineProps) {
  const track = useRef<HTMLDivElement>(null)
  const n = months.length
  const index = Math.max(
    0,
    months.findIndex((m) => m.month === value),
  )
  const max = Math.max(...months.map((m) => m.hotspots), 1)
  const current = months[index]

  const go = (i: number) => {
    const m = months[Math.max(0, Math.min(n - 1, i))]
    if (m && m.month !== value) onChange(m.month)
  }

  const fromPointer = (e: PointerEvent<HTMLDivElement>) => {
    const r = track.current?.getBoundingClientRect()
    if (!r || r.width === 0) return
    go(Math.floor(((e.clientX - r.left) / r.width) * n))
  }

  const onKey = (e: KeyboardEvent) => {
    const step: Record<string, number> = {
      ArrowLeft: -1,
      ArrowDown: -1,
      ArrowRight: 1,
      ArrowUp: 1,
      PageDown: -12,
      PageUp: 12,
    }
    if (e.key in step) go(index + step[e.key])
    else if (e.key === 'Home') go(0)
    else if (e.key === 'End') go(n - 1)
    else return
    e.preventDefault()
  }

  if (n === 0 || !current) return null
  const years = months.filter((m) => m.month_of_year === 1 && m.year % 5 === 0)
  const at = (i: number) => `${((i + 0.5) / n) * 100}%`

  return (
    <div className={cn('flex items-end gap-1', className)}>
      <button
        type="button"
        onClick={() => go(index - 1)}
        disabled={index === 0}
        aria-label="Previous month"
        className="text-soft hover:text-bone grid size-11 shrink-0 place-items-center rounded-full transition-colors hover:bg-white/5 active:scale-95 disabled:opacity-30"
      >
        <ChevronLeft className="size-5" />
      </button>

      <div className="min-w-0 flex-1">
        <div className="mb-1.5 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[13px]">
          <p className="flex flex-wrap items-baseline gap-x-2" aria-hidden>
            <span className="font-semibold whitespace-nowrap">{formatMonth(current.month)}</span>
            <span className="num text-soft font-mono whitespace-nowrap">
              {formatCount(current.hotspots)} hotspots{current.incomplete ? ' so far' : ''}
            </span>
            {current.anomaly_pct !== null && (
              <span
                className="num font-mono text-[12px] whitespace-nowrap"
                style={{ color: barColor(current) }}
              >
                {formatSignedPct(current.anomaly_pct)} vs usual
              </span>
            )}
          </p>
          <ul className="text-mute ml-auto flex gap-3 text-[11px]" aria-label="Bar colours">
            <li className="flex items-center gap-1.5">
              <span aria-hidden className="size-2 rounded-[2px] bg-[var(--anom-much-above)]" />
              more fire than usual
            </li>
            <li className="flex items-center gap-1.5">
              <span aria-hidden className="size-2 rounded-[2px] bg-[var(--anom-below)]" />
              less
            </li>
          </ul>
        </div>
        <div
          ref={track}
          role="slider"
          tabIndex={0}
          aria-label="Month shown on the map"
          aria-valuemin={0}
          aria-valuemax={n - 1}
          aria-valuenow={index}
          aria-valuetext={monthText(current)}
          onKeyDown={onKey}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId)
            fromPointer(e)
          }}
          onPointerMove={(e) => {
            if (e.currentTarget.hasPointerCapture(e.pointerId)) fromPointer(e)
          }}
          className="relative cursor-pointer touch-none rounded-md select-none"
          style={{ height: HEIGHT }}
        >
          <svg
            viewBox={`0 0 ${n} ${HEIGHT}`}
            preserveAspectRatio="none"
            className="absolute inset-0 size-full"
            aria-hidden
          >
            <line x1={0} x2={n} y1={HEIGHT - 0.5} y2={HEIGHT - 0.5} stroke="var(--line)" />
            {months.map((m, i) => {
              const h = Math.max(1, Math.sqrt(m.hotspots / max) * (HEIGHT - 2))
              return (
                <rect
                  key={m.month}
                  x={i + 0.12}
                  width={0.76}
                  y={HEIGHT - h}
                  height={h}
                  fill={i === index ? 'var(--saffron)' : barColor(m)}
                  opacity={i === index ? 1 : m.incomplete ? 0.45 : 0.8}
                />
              )
            })}
          </svg>
          <span
            aria-hidden
            className="bg-saffron pointer-events-none absolute -top-1 -bottom-1 w-0.5 -translate-x-1/2 rounded-full transition-[left] duration-150 ease-out"
            style={{ left: at(index) }}
          />
        </div>
        <div className="text-mute num relative mt-1 h-4 font-mono text-[11px]" aria-hidden>
          {years.map((m) => {
            const i = months.indexOf(m)
            return (
              <span key={m.month} className="absolute -translate-x-1/2" style={{ left: at(i) }}>
                {m.year}
              </span>
            )
          })}
        </div>
      </div>

      <button
        type="button"
        onClick={() => go(index + 1)}
        disabled={index === n - 1}
        aria-label="Next month"
        className="text-soft hover:text-bone grid size-11 shrink-0 place-items-center rounded-full transition-colors hover:bg-white/5 active:scale-95 disabled:opacity-30"
      >
        <ChevronRight className="size-5" />
      </button>
    </div>
  )
}
