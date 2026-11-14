import type { CalendarResponse } from '@/api/types'
import { Mascot } from '@/components/mascot'
import { StatusChip } from '@/components/status-chip'
import { formatCount, formatMonth, monthName } from '@/lib/format'
import { statusMeta } from '@/lib/status'

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`
}

/** The answer first: how this month compares with the same month of past years. */
export function CurrentStatus({ data, name }: { data: CalendarResponse; name: string }) {
  const c = data.calendar.current
  if (!c) return null
  const meta = statusMeta(c.status)
  const month = Number(c.month.slice(5))
  const peak = data.calendar.peak
  return (
    <div className="grid items-center gap-x-6 gap-y-0 sm:grid-cols-[1fr_auto]">
      <div>
        <StatusChip status={c.status} className="mb-3" />
        <h1 className="text-[clamp(1.75rem,4.5vw,3.25rem)] leading-[1.05] font-semibold tracking-tight text-balance">
          {formatMonth(c.month)} in {name} is {meta.phrase}
        </h1>
        <p className="text-ink-2 tabular mt-4 max-w-2xl text-base leading-relaxed sm:text-lg">
          {c.incomplete ? (
            <>
              {formatCount(c.hotspots)} hotspots so far ({Math.round(c.elapsed_fraction * 100)}% of
              the month), about {formatCount(c.projected)} at this pace.
            </>
          ) : (
            <>{formatCount(c.hotspots)} hotspots.</>
          )}{' '}
          {c.median !== null ? (
            <>
              The usual {monthName(month)} has {formatCount(c.median)}: this one ranks{' '}
              {ordinal(c.rank)} of {c.years_compared + 1} since {data.calendar.from.slice(0, 4)}.
            </>
          ) : (
            <>There are no past years in this period to compare it with.</>
          )}
        </p>
        <dl className="tabular mt-6 grid max-w-2xl grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-muted-foreground">Usual peak</dt>
            <dd className="text-lg font-semibold">{monthName(peak.month_of_year)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Busiest year</dt>
            <dd className="text-lg font-semibold">
              {peak.busiest_year || '–'}{' '}
              <span className="text-muted-foreground text-sm font-normal">
                {peak.busiest_year ? formatCount(peak.busiest_year_hotspots) : ''}
              </span>
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Record month</dt>
            <dd className="text-lg font-semibold">
              {peak.record_month ? formatMonth(peak.record_month, 'short') : '–'}{' '}
              <span className="text-muted-foreground text-sm font-normal">
                {peak.record_month ? formatCount(peak.record_hotspots) : ''}
              </span>
            </dd>
          </div>
        </dl>
      </div>
      <Mascot
        mood={meta.mood}
        label={`The mascot looks ${meta.mood === 'alarmed' ? 'alarmed' : meta.mood === 'worried' ? 'worried' : meta.mood}`}
        className="order-first w-24 justify-self-end sm:order-none sm:w-44 sm:justify-self-center lg:w-52"
      />
    </div>
  )
}
