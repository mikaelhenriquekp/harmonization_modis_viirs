import { CalendarDays, Download, FileSpreadsheet } from 'lucide-react'
import { useId, useState } from 'react'

import { calendarCsvUrl } from '@/api/calendar'
import { hotspotsCsvUrl } from '@/api/hotspots'
import type { Area } from '@/lib/area'
import type { Country } from '@/lib/country'
import { monthSpanDays, TODAY } from '@/lib/export'
import { cn } from '@/lib/utils'

const FIRST_MONTH = '2002-07'
const MAX_DAYS = 366

interface ExportPanelProps {
  /** The place on screen: the chosen point, shape or region. */
  area: Area
  name: string
  /** The country under the place, to offer the whole of it. */
  country?: Country | null
  /** Last day with data (YYYY-MM-DD). */
  dataUntil?: string
  from?: string
  to?: string
  className?: string
}

type Scope = 'place' | 'country'

/** Download the record of the chosen place, or of its whole country, between two months. */
export function ExportPanel({
  area,
  name,
  country,
  dataUntil,
  from: initialFrom,
  to: initialTo,
  className,
}: ExportPanelProps) {
  const id = useId()
  const lastMonth = (dataUntil ?? TODAY).slice(0, 7)
  const [scope, setScope] = useState<Scope>('place')
  const [from, setFrom] = useState(initialFrom ?? FIRST_MONTH)
  const [to, setTo] = useState(initialTo ?? lastMonth)
  const canCountry = !!country?.outline
  const target = scope === 'country' && country?.outline ? country.outline : area
  const valid = from >= FIRST_MONTH && from <= to
  const days = valid ? monthSpanDays(from, to, dataUntil) : null
  const field = 'bg-card-2 border-line rounded-md border px-2 py-1 font-mono text-[12px]'

  return (
    <div className={cn('space-y-3 text-[13px]', className)}>
      <fieldset>
        <legend className="text-soft mb-1.5 text-[12px]">What to download</legend>
        <div className="flex flex-wrap gap-2">
          {(
            [
              ['place', name],
              ['country', country ? `All of ${country.name}` : 'Whole country'],
            ] as const
          ).map(([value, label]) => (
            <label
              key={value}
              className={cn(
                'border-line has-[:checked]:border-saffron has-[:checked]:bg-saffron-soft has-[:checked]:text-saffron max-w-full cursor-pointer truncate rounded-full border px-3 py-1.5 has-[:focus-visible]:outline-2',
                value === 'country' && !canCountry && 'cursor-not-allowed opacity-40',
              )}
            >
              <input
                type="radio"
                name={`${id}-scope`}
                className="sr-only"
                checked={scope === value}
                disabled={value === 'country' && !canCountry}
                onChange={() => setScope(value)}
              />
              {label}
            </label>
          ))}
        </div>
        {!canCountry && (
          <p className="text-mute mt-1.5 text-[11px]">
            Tap a point on land to get its whole country too.
          </p>
        )}
        {scope === 'country' && (
          <p className="text-mute mt-1.5 text-[11px]">
            The landmass under your point, inside its real borders (simplified outline).
          </p>
        )}
      </fieldset>

      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={`${id}-from`} className="text-soft text-[12px]">
          From
        </label>
        <input
          id={`${id}-from`}
          type="month"
          value={from}
          min={FIRST_MONTH}
          max={to}
          onChange={(e) => setFrom(e.target.value)}
          className={field}
        />
        <label htmlFor={`${id}-to`} className="text-soft text-[12px]">
          to
        </label>
        <input
          id={`${id}-to`}
          type="month"
          value={to}
          min={from}
          max={lastMonth}
          onChange={(e) => setTo(e.target.value)}
          className={field}
        />
      </div>

      {!valid ? (
        <p className="text-garnet text-[12px]">
          Pick a start month from July 2002, before the end.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          <a
            href={calendarCsvUrl(target, { from, to })}
            download
            className="bg-saffron flex h-10 items-center justify-center gap-2 rounded-full px-4 font-semibold text-[#100d0f]"
          >
            <CalendarDays className="size-4" /> Monthly calendar (CSV)
          </a>
          {days && days.days <= MAX_DAYS ? (
            <a
              href={hotspotsCsvUrl(target, days.from, days.to)}
              download
              className="border-line flex h-10 items-center justify-center gap-2 rounded-full border px-4 font-semibold hover:bg-white/5"
            >
              <FileSpreadsheet className="size-4" /> Every detection (CSV)
            </a>
          ) : (
            <p className="text-mute flex items-center gap-2 text-[11px]">
              <Download className="size-3.5 shrink-0" /> Individual detections come in files of up
              to 12 months: shorten the period to download them.
            </p>
          )}
        </div>
      )}
      <p className="text-mute text-[11px] leading-relaxed">
        The calendar has harmonized hotspots, radiative power, the usual value and the anomaly of
        each month. Detections are the raw NASA FIRMS points with date, time, satellite, power and
        day or night.
      </p>
    </div>
  )
}
