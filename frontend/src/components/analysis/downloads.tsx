import { CalendarDays, Code2, Copy, Download, FileSpreadsheet } from 'lucide-react'
import { useState, type ReactNode } from 'react'

import { calendarCsvUrl, type MonthRange } from '@/api/calendar'
import { hotspotsCsvUrl } from '@/api/hotspots'
import { Card } from '@/components/card'
import { useHotspots } from '@/hooks/use-fire'
import { areaToParams, type Area } from '@/lib/area'

const DAY = 86_400_000

function addDays(day: string, n: number): string {
  return new Date(Date.parse(day) + n * DAY).toISOString().slice(0, 10)
}

function Row({
  icon,
  title,
  sub,
  action,
}: {
  icon: ReactNode
  title: string
  sub: string
  action: ReactNode
}) {
  return (
    <li className="border-line flex items-center gap-4 border-b py-4 last:border-b-0">
      <span className="bg-card-2 text-coral grid size-11 shrink-0 place-items-center rounded-[12px]">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-semibold">{title}</p>
        <p className="text-mute truncate font-mono text-[11px]">{sub}</p>
      </div>
      {action}
    </li>
  )
}

function CsvButton({ href, label = 'CSV' }: { href: string; label?: string }) {
  return (
    <a
      href={href}
      download
      className="bg-saffron flex h-9 shrink-0 items-center gap-1.5 rounded-full px-4 text-[13px] font-semibold text-[#100d0f]"
    >
      <Download className="size-4" /> {label}
    </a>
  )
}

/** Take the analysis with you. */
export function Downloads({
  area,
  range,
  name,
  dataUntil,
}: {
  area: Area
  range: MonthRange
  name: string
  dataUntil: string
}) {
  const [to, setTo] = useState(dataUntil)
  const [from, setFrom] = useState(addDays(dataUntil, -29))
  const [copied, setCopied] = useState(false)
  const days = (Date.parse(to) - Date.parse(from)) / DAY + 1
  const ok = days >= 1 && days <= 366 && from >= '2002-07-01'
  const preview = useHotspots(area, addDays(dataUntil, -6), dataUntil)
  const apiUrl = `${window.location.origin}/api/calendar?${new URLSearchParams({ ...areaToParams(area), ...(range.from ? { from: range.from } : {}), ...(range.to ? { to: range.to } : {}) }).toString()}`

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <Card className="min-w-0 px-5">
        <ul>
          <Row
            icon={<FileSpreadsheet className="size-5" />}
            title="Detected hotspots"
            sub="each detection at 375 m / 1 km, from NASA FIRMS"
            action={
              ok ? (
                <CsvButton href={hotspotsCsvUrl(area, from, to)} />
              ) : (
                <span className="text-garnet text-[12px]">≤ 366 days</span>
              )
            }
          />
          <li className="flex flex-wrap items-center gap-2 pb-4 pl-[60px] text-[12px]">
            <label className="text-soft flex items-center gap-1.5">
              From
              <input
                type="date"
                value={from}
                min="2002-07-01"
                max={to}
                onChange={(e) => setFrom(e.target.value)}
                className="bg-card-2 border-line rounded-md border px-2 py-1 font-mono"
              />
            </label>
            <label className="text-soft flex items-center gap-1.5">
              to
              <input
                type="date"
                value={to}
                min={from}
                max={dataUntil}
                onChange={(e) => setTo(e.target.value)}
                className="bg-card-2 border-line rounded-md border px-2 py-1 font-mono"
              />
            </label>
          </li>
          <Row
            icon={<CalendarDays className="size-5" />}
            title="Monthly calendar + anomalies"
            sub={`${name}: hotspots, energy, source, usual value, anomaly`}
            action={<CsvButton href={calendarCsvUrl(area, range)} />}
          />
          <Row
            icon={<Code2 className="size-5" />}
            title="Reproducible query"
            sub="the same numbers from the open API"
            action={
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard?.writeText(apiUrl).then(() => setCopied(true))
                }}
                className="border-line flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-4 text-[13px] font-semibold hover:bg-white/5"
              >
                <Copy className="size-4" /> {copied ? 'Copied' : 'Copy'}
              </button>
            }
          />
        </ul>
      </Card>
      <Card className="min-w-0 p-5">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-saffron truncate font-mono text-[12px]">
            hotspots_{addDays(dataUntil, -6)}_{dataUntil}.csv, preview
          </p>
          <p className="text-mute shrink-0 font-mono text-[11px]">
            {preview.data ? `${Math.min(5, preview.data.count)} of ${preview.data.count} rows` : ''}
          </p>
        </div>
        {preview.isError ? (
          <p className="text-soft mt-4 text-[13px]">
            The preview needs NASA FIRMS, which did not answer. The download links still work.
          </p>
        ) : !preview.data ? (
          <p className="text-mute mt-4 text-[13px]">Fetching the last week of detections…</p>
        ) : preview.data.count === 0 ? (
          <p className="text-soft mt-4 text-[13px]">No detections in this area in the last week.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="num w-full min-w-[480px] font-mono text-[11px]">
              <caption className="sr-only">First rows of the hotspots file</caption>
              <thead className="text-mute">
                <tr>
                  {['date', 'time', 'lat', 'lon', 'satellite', 'frp_mw', 'confidence'].map((h) => (
                    <th key={h} scope="col" className="py-2 text-left font-normal">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.data.rows.slice(0, 5).map((r, i) => (
                  <tr key={i} className="border-line border-t">
                    <td className="py-2">{String(r[2])}</td>
                    <td>{String(r[3]).padStart(4, '0')}</td>
                    <td>{Number(r[0]).toFixed(4)}</td>
                    <td>{Number(r[1]).toFixed(4)}</td>
                    <td>{String(r[4])}</td>
                    <td>{String(r[6])}</td>
                    <td>{String(r[5])}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-soft mt-4 text-[12px] leading-relaxed">
          <span className="text-saffron">provisional</span> marks near real time detections FIRMS
          has not classified yet; the calendar counts vegetation fires only, the full download can
          include every detection.
        </p>
      </Card>
    </div>
  )
}
