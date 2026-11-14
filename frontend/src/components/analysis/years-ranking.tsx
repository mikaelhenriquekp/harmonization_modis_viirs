import { Info } from 'lucide-react'

import type { Calendar } from '@/api/types'
import { formatCount } from '@/lib/format'
import { topYears } from '@/lib/insights'

const RAMP = [
  'var(--heat-6)',
  'var(--heat-6)',
  'var(--heat-5)',
  'var(--heat-5)',
  'var(--heat-4)',
  'var(--heat-4)',
  'var(--heat-3)',
  'var(--heat-3)',
  'var(--heat-2)',
  'var(--heat-2)',
]

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`
}

/** The ten most active years. */
export function YearsRanking({ calendar }: { calendar: Calendar }) {
  const top = topYears(calendar, 10)
  const current = calendar.years.at(-1)
  const max = Math.max(1, ...top.map((y) => y.hotspots))
  return (
    <div>
      <h3 className="text-[20px] leading-tight font-semibold">Years ranked by hotspots</h3>
      <p className="text-soft mt-1 text-[13px]">
        The {top.length} most active complete years in the area
      </p>
      <ol aria-label="Most active years" className="mt-5 space-y-2.5">
        {top.map((y, i) => (
          <li
            key={y.year}
            className="grid grid-cols-[36px_56px_1fr_64px] items-center gap-2 text-[13px]"
          >
            <span className="text-mute num font-mono">{ordinal(y.rank!)}</span>
            <span className="num font-mono">{y.year}</span>
            <span
              className="h-5 rounded-[4px]"
              style={{ width: `${(y.hotspots / max) * 100}%`, background: RAMP[i] }}
            />
            <span className="num text-right font-mono">{formatCount(y.hotspots)}</span>
          </li>
        ))}
      </ol>
      {current && !current.complete && (
        <p className="text-soft mt-3 font-mono text-[12px]">
          <span className="bg-saffron mr-1.5 inline-block size-2 rounded-full" />
          {current.year} so far: {formatCount(current.hotspots)} in {current.months} months
        </p>
      )}
      <p className="bg-card-2 text-soft mt-5 flex gap-3 rounded-[14px] p-4 text-[13px] leading-snug">
        <Info className="text-slate mt-0.5 size-4 shrink-0" aria-hidden />
        Anomalies compare each month with the same month of every other year in the record (median
        and middle half).
      </p>
    </div>
  )
}
