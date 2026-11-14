import type { Calendar } from '@/api/types'
import { formatCount, formatMonth, monthName } from '@/lib/format'
import { heatColor } from '@/lib/heat'
import { cn } from '@/lib/utils'

interface MiniCalendarProps {
  calendar: Calendar
  /** The month shown on the map ("YYYY-MM"), if one is picked. */
  selected: string | null
  onSelect: (month: string | null) => void
}

/** The burning calendar, compact: every month is a button that drives the map. */
export function MiniCalendar({ calendar, selected, onSelect }: MiniCalendarProps) {
  const n = calendar.scale.colors.length - 1
  const { years, values, classes } = calendar.grid
  const top = calendar.scale.breaks.at(-1)
  return (
    <div>
      <div className="grid grid-cols-[2.2rem_1fr] items-center gap-1.5" aria-hidden>
        <span />
        <div className="grid grid-cols-12 gap-[2px]">
          {Array.from({ length: 12 }, (_, i) => (
            <span key={i} className="text-mute text-center font-mono text-[9px]">
              {monthName(i + 1, 'narrow')}
            </span>
          ))}
        </div>
      </div>
      <div className="mt-1 space-y-[2px]" role="group" aria-label="Burning calendar">
        {years.map((y, r) => (
          <div key={y} className="grid grid-cols-[2.2rem_1fr] items-center gap-1.5">
            <span className="text-mute font-mono text-[10px] leading-none">{y}</span>
            <div className="grid grid-cols-12 gap-[2px]">
              {classes[r].map((c, i) => {
                const month = `${y}-${String(i + 1).padStart(2, '0')}`
                const v = values[r][i]
                if (c < 0 || v === null) return <span key={i} className="h-3.5" />
                const on = month === selected
                return (
                  <button
                    key={i}
                    type="button"
                    aria-pressed={on}
                    aria-label={`${formatMonth(month)}: ${formatCount(v)} hotspots. Show on the map`}
                    title={`${formatMonth(month, 'short')}: ${formatCount(v)}`}
                    onClick={() => onSelect(on ? null : month)}
                    className={cn(
                      'h-3.5 rounded-[2px]',
                      on && 'outline-bone outline-2 outline-offset-1',
                    )}
                    style={{ background: heatColor(c, n) }}
                  />
                )
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-1 text-[10px]">
        <span className="text-mute font-mono">0</span>
        {Array.from({ length: n + 1 }, (_, c) => (
          <span
            key={c}
            aria-hidden
            className="h-2 flex-1 rounded-[2px]"
            style={{ background: heatColor(c, n) }}
          />
        ))}
        <span className="text-mute font-mono">{top ? `${formatCount(top)}+` : 'most'}</span>
      </div>
      <p className="text-mute mt-1.5 text-[11px]">Hotspots per month. Tap a month to map it.</p>
    </div>
  )
}
