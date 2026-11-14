import type { ReactNode } from 'react'

import type { CalendarResponse, Coverage } from '@/api/types'
import { BigNumber, Card } from '@/components/card'
import { Skeleton } from '@/components/state'
import { formatCount, formatMonth, formatSignedPct } from '@/lib/format'
import { anomalyClass } from '@/lib/heat'
import { statusMeta, TONE_COLOR } from '@/lib/status'

function Tile({ label, value, sub }: { label: string; value: ReactNode; sub: ReactNode }) {
  return (
    <Card className="min-w-0 px-4 py-3">
      <p className="eyebrow truncate">{label}</p>
      <BigNumber className="mt-1 truncate text-[24px] leading-tight">{value}</BigNumber>
      <p className="text-soft mt-0.5 truncate text-[12px]">{sub}</p>
    </Card>
  )
}

interface KpisProps {
  data?: CalendarResponse
  coverage?: Coverage
  /** The month picked on the calendar, if any. */
  month: string | null
}

/** The four numbers of the selection: hotspots, energy, anomaly, coverage. */
export function Kpis({ data, coverage, month }: KpisProps) {
  if (!data) {
    return (
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-[86px]" />
        ))}
      </div>
    )
  }
  const cal = data.calendar
  const picked = month ? cal.months.find((m) => m.month === month) : undefined
  const hotspots = picked ? picked.hotspots : cal.months.reduce((s, m) => s + m.hotspots, 0)
  const frp = picked ? picked.frp_mw : cal.months.reduce((s, m) => s + m.frp_mw, 0)
  const period = picked ? formatMonth(picked.month) : `${cal.from} to ${cal.to}`
  const status = picked ? anomalyClass(picked.percentile) : (cal.current?.status ?? 'no_history')
  const pct = picked ? picked.anomaly_pct : (cal.current?.anomaly_pct ?? null)
  const anomalyMonth = picked?.month ?? cal.current?.month
  const meta = statusMeta(status)
  const estimated = picked?.estimated
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Tile
        label="Harmonized hotspots"
        value={formatCount(hotspots)}
        sub={`${period}${estimated ? ' · estimated from MODIS' : ''}`}
      />
      <Tile
        label="Radiative power (FRP)"
        value={`${formatCount(frp)} MW`}
        sub="summed over the detections"
      />
      <Tile
        label="Anomaly"
        value={
          <span className="flex items-center gap-2">
            <span
              aria-hidden
              className="size-2.5 shrink-0 rounded-full"
              style={{ background: TONE_COLOR[meta.tone] }}
            />
            {pct !== null ? formatSignedPct(pct) : 'n/a'}
          </span>
        }
        sub={
          anomalyMonth
            ? `${meta.label}, ${formatMonth(anomalyMonth, 'short')} vs its usual`
            : meta.label
        }
      />
      <Tile
        label="Data coverage"
        value={`${formatCount(data.area.cells)} cells`}
        sub={
          <>
            0.25° grid · up to {cal.data_until}
            {coverage && ` · ${coverage.regions.harmonized}/${coverage.regions.total} countries`}
          </>
        }
      />
    </div>
  )
}
