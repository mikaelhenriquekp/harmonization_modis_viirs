import { CalendarRange, Download, MapPin, Pencil } from 'lucide-react'
import { useId, useState } from 'react'
import { Link, useLocation } from 'react-router'

import type { MonthRange } from '@/api/calendar'
import { PeriodPicker } from '@/components/explore/period-picker'
import type { Area } from '@/lib/area'
import { formatCount } from '@/lib/format'

function sizeKm2(cells: number, south: number, north: number): number {
  const lat = ((south + north) / 2) * (Math.PI / 180)
  return cells * 27.8 * 27.8 * Math.cos(lat)
}

interface TopBarProps {
  name: string
  area: Area
  cells?: number
  gridBBox?: [number, number, number, number]
  range: MonthRange
  from: string
  to: string
  dataUntil?: string
  onEditArea: () => void
  onRange: (r: MonthRange) => void
}

/** The analysis' header: the place, the period, how fresh the data is. */
export function TopBar({
  name,
  area,
  cells,
  gridBBox,
  range,
  from,
  to,
  dataUntil,
  onEditArea,
  onRange,
}: TopBarProps) {
  const [period, setPeriod] = useState(false)
  const periodId = useId()
  const { search } = useLocation()
  const km2 =
    cells && gridBBox && area.kind !== 'world' ? sizeKm2(cells, gridBBox[1], gridBBox[3]) : null
  return (
    <div className="bg-background/95 border-line sticky top-0 z-[500] border-b backdrop-blur">
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-2 px-4 py-3 sm:px-8">
        <button
          type="button"
          onClick={onEditArea}
          className="bg-saffron-soft text-saffron flex min-w-0 items-center gap-2 rounded-full px-4 py-2 text-[14px] font-semibold"
          aria-label={`Area: ${name}. Change it`}
        >
          <MapPin className="size-4 shrink-0" fill="currentColor" />
          <span className="truncate">{name}</span>
          {km2 !== null && (
            <span className="text-saffron/70 num hidden font-mono text-[12px] font-normal sm:inline">
              {formatCount(Math.round(km2))} km²
            </span>
          )}
          <Pencil className="size-3.5 shrink-0" />
        </button>
        <div className="relative">
          <button
            type="button"
            aria-expanded={period}
            aria-controls={periodId}
            onClick={() => setPeriod((p) => !p)}
            className="border-line num flex items-center gap-2 rounded-full border px-4 py-2 font-mono text-[13px] hover:bg-white/5"
          >
            <CalendarRange className="size-4" /> {from} → {to}
          </button>
          {period && (
            <div
              id={periodId}
              className="bg-card border-line absolute top-full left-0 z-10 mt-2 w-[min(420px,calc(100vw-2rem))] rounded-[16px] border p-4 shadow-2xl"
            >
              <PeriodPicker
                from={range.from}
                to={range.to}
                currentYear={Number((dataUntil ?? to).slice(0, 4))}
                onChange={(r) => {
                  onRange(r)
                  setPeriod(false)
                }}
              />
            </div>
          )}
        </div>
        {dataUntil && (
          <p className="text-soft hidden items-center gap-2 font-mono text-[12px] sm:flex">
            <span className="bg-saffron size-1.5 rounded-full" /> Data up to {dataUntil}
          </p>
        )}
        <Link
          to={{ search, hash: '#downloads' }}
          className="bg-saffron ml-auto flex items-center gap-2 rounded-full px-4 py-2 text-[14px] font-semibold text-[#100d0f]"
        >
          <Download className="size-4" /> <span className="hidden sm:inline">Export analysis</span>
          <span className="sm:hidden">Export</span>
        </Link>
      </div>
    </div>
  )
}
