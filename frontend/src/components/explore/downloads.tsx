import { Download } from 'lucide-react'
import { useId, useState } from 'react'

import { calendarCsvUrl, type MonthRange } from '@/api/calendar'
import { hotspotsCsvUrl } from '@/api/hotspots'
import type { Area } from '@/lib/area'

const MAX_DAYS = 366
const DAY = 86_400_000

function addDays(day: string, n: number): string {
  return new Date(Date.parse(day) + n * DAY).toISOString().slice(0, 10)
}

function DownloadLink({ href, children }: { href: string; children: string }) {
  return (
    <a
      href={href}
      download
      className="bg-gold inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-[#03133f]"
    >
      <Download className="size-4" aria-hidden />
      {children}
    </a>
  )
}

/** Take the analysis away: the monthly calendar and the raw detections. */
export function Downloads({
  area,
  range,
  dataUntil,
}: {
  area: Area
  range: MonthRange
  dataUntil: string
}) {
  const [to, setTo] = useState(dataUntil)
  const [from, setFrom] = useState(addDays(dataUntil, -29))
  const [all, setAll] = useState(false)
  const fromId = useId()
  const toId = useId()
  const days = (Date.parse(to) - Date.parse(from)) / DAY + 1
  const problem =
    !from || !to || Number.isNaN(days)
      ? 'Pick two days.'
      : days < 1
        ? 'The first day must be before the last.'
        : days > MAX_DAYS
          ? `Ask for at most ${MAX_DAYS} days; the monthly calendar covers the whole record.`
          : from < '2002-07-01'
            ? 'The record starts on 2002-07-01.'
            : null

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div className="border-line rounded-xl border p-4">
        <h3 className="font-semibold">Monthly calendar</h3>
        <p className="text-muted-foreground mt-1 mb-4 text-sm">
          Every month of the period with its hotspots, energy, source, the usual value for that
          month and the anomaly.
        </p>
        <DownloadLink href={calendarCsvUrl(area, range)}>Monthly calendar (CSV)</DownloadLink>
      </div>
      <div className="border-line rounded-xl border p-4">
        <h3 className="font-semibold">Raw hotspots</h3>
        <p className="text-muted-foreground mt-1 text-sm">
          Each detection at its own resolution (375 m VIIRS, 1 km MODIS), fetched from NASA FIRMS.
          Up to a year at a time.
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-3 text-sm">
          <label htmlFor={fromId} className="grid gap-1">
            <span className="text-muted-foreground">First day</span>
            <input
              id={fromId}
              type="date"
              value={from}
              min="2002-07-01"
              max={to}
              onChange={(e) => setFrom(e.target.value)}
              className="bg-surface border-line rounded-md border px-2 py-1"
            />
          </label>
          <label htmlFor={toId} className="grid gap-1">
            <span className="text-muted-foreground">Last day</span>
            <input
              id={toId}
              type="date"
              value={to}
              min={from}
              max={dataUntil}
              onChange={(e) => setTo(e.target.value)}
              className="bg-surface border-line rounded-md border px-2 py-1"
            />
          </label>
          <label className="flex items-center gap-2 pb-1.5">
            <input
              type="checkbox"
              checked={all}
              onChange={(e) => setAll(e.target.checked)}
              className="accent-[var(--accent-gold)]"
            />
            <span>Include every detection, not only those counted</span>
          </label>
        </div>
        <div className="mt-4">
          {problem ? (
            <p className="text-tone-critical text-sm">{problem}</p>
          ) : (
            <DownloadLink href={hotspotsCsvUrl(area, from, to, all)}>
              Raw hotspots (CSV)
            </DownloadLink>
          )}
        </div>
      </div>
    </div>
  )
}
