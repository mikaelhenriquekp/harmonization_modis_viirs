import { useState, type ReactNode } from 'react'
import { Link } from 'react-router'

import { ATTRIBUTION } from '@/lib/attribution'
import { AreaEditor } from '@/components/analysis/area-editor'
import { CalendarTable } from '@/components/analysis/calendar-table'
import { Downloads } from '@/components/analysis/downloads'
import { NormalChart } from '@/components/analysis/normal-chart'
import { Satellites } from '@/components/analysis/satellites'
import { TopBar } from '@/components/analysis/top-bar'
import { YearsRanking } from '@/components/analysis/years-ranking'
import { Card } from '@/components/card'
import { Mascot } from '@/components/mascot'
import { ErrorState, Skeleton } from '@/components/state'
import { useExploreParams } from '@/hooks/use-explore-params'
import { useCalendar, useRegion, useSensors } from '@/hooks/use-fire'
import { statusMeta } from '@/lib/status'

const WORDS = [
  'Zero',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
  'Thirteen',
  'Fourteen',
  'Fifteen',
  'Sixteen',
  'Seventeen',
  'Eighteen',
  'Nineteen',
  'Twenty',
]

function yearsInWords(n: number): string {
  if (n <= 20) return WORDS[n]
  const tens = ['', '', 'Twenty', 'Thirty']
  const t = Math.floor(n / 10)
  return n % 10 === 0 ? tens[t] : `${tens[t]}-${WORDS[n % 10].toLowerCase()}`
}

function Heading({
  eyebrow,
  children,
  actions,
}: {
  eyebrow: string
  children: ReactNode
  actions?: ReactNode
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h2 className="mt-2 text-[34px] leading-[1.05] font-bold tracking-tight sm:text-[40px]">
          {children}
        </h2>
      </div>
      {actions}
    </div>
  )
}

/** The analysis of one area: calendar, anomalies, sensors, downloads. */
export function AnalysisPage() {
  const [{ area, name, from, to }, update] = useExploreParams()
  const range = { from, to }
  const [editing, setEditing] = useState(false)
  const calendar = useCalendar(area, range)
  const sensors = useSensors(area, range)
  const data = calendar.data
  const cal = data?.calendar
  const main = data?.regions.find((r) => r.status === 'ok')
  const region = useRegion(main?.id)
  const meta = cal?.current ? statusMeta(cal.current.status) : null

  return (
    <div>
      <TopBar
        name={name}
        area={area}
        cells={data?.area.cells}
        gridBBox={data?.area.grid_bbox}
        range={range}
        from={cal?.from ?? from ?? '2002-07'}
        to={cal?.to ?? to ?? ''}
        dataUntil={cal?.data_until}
        onEditArea={() => setEditing(true)}
        onRange={(r) => update(r)}
      />
      <AreaEditor
        open={editing}
        area={area}
        onClose={() => setEditing(false)}
        onChange={(a, n) => update({ area: a, name: n, from: undefined, to: undefined })}
      />

      <div className="mx-auto max-w-[1400px] space-y-20 px-4 py-10 sm:px-8">
        {calendar.isError && !data ? (
          <ErrorState
            error={calendar.error}
            onRetry={() => void calendar.refetch()}
            title="The analysis for this area could not be loaded"
          />
        ) : !cal ? (
          <div className="space-y-4">
            <Skeleton className="h-10 w-2/3" />
            <Skeleton className="h-[560px]" />
          </div>
        ) : (
          <>
            <section id="calendar" className="scroll-mt-24" aria-labelledby="calendar-title">
              <Heading eyebrow="02 / Burn activity calendar">
                <span id="calendar-title">
                  {yearsInWords(cal.grid.years.length)} years of fire,{' '}
                  <span className="serif">month by month</span>
                </span>
              </Heading>
              <Card className={`p-4 sm:p-6 ${calendar.isFetching ? 'opacity-70' : ''}`}>
                <CalendarTable calendar={cal} />
              </Card>
            </section>

            <section id="anomalies" className="scroll-mt-24" aria-labelledby="anomalies-title">
              <Heading
                eyebrow="03 / Historical comparison"
                actions={
                  meta && (
                    <div className="flex items-center gap-3">
                      <Mascot
                        mood={meta.mood}
                        label={`The mascot looks ${meta.mood}`}
                        className="w-16"
                      />
                      <p className="text-soft max-w-[16rem] text-[13px] leading-snug">
                        {meta.mood === 'alarmed'
                          ? 'This month is burning much more than usual here.'
                          : meta.mood === 'worried'
                            ? 'More fire than usual here.'
                            : meta.mood === 'happy'
                              ? 'Less fire than usual here.'
                              : meta.mood === 'calm'
                                ? 'Business as usual here.'
                                : 'Not enough history to compare.'}
                      </p>
                    </div>
                  )
                }
              >
                <span id="anomalies-title">
                  Is this <span className="serif">normal</span>?
                </span>
              </Heading>
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
                <Card className="min-w-0 p-5 sm:p-6">
                  <NormalChart calendar={cal} />
                </Card>
                <Card className="min-w-0 p-5 sm:p-6">
                  <YearsRanking calendar={cal} />
                </Card>
              </div>
            </section>

            <section id="sensors" className="scroll-mt-24" aria-label="Two satellites, one record">
              <Satellites
                sensors={sensors.data}
                region={region.data}
                lastYear={cal.grid.years.at(-1)!}
              />
            </section>

            <section id="downloads" className="scroll-mt-24" aria-labelledby="downloads-title">
              <Heading eyebrow="05 / Downloads">
                <span id="downloads-title">
                  Take the <span className="serif">analysis</span> with you
                </span>
              </Heading>
              <Downloads
                key={cal.data_until}
                area={area}
                range={range}
                name={name}
                dataUntil={cal.data_until}
              />
            </section>

            {data.notes.length > 0 && (
              <section aria-label="Reading these numbers">
                <ul className="text-soft space-y-2 text-[13px] leading-relaxed">
                  {data.notes.map((n) => (
                    <li key={n}>· {n}</li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}

        <footer className="border-line text-mute flex flex-wrap items-start justify-between gap-4 border-t pt-6 text-[12px]">
          <p className="max-w-3xl leading-relaxed">{ATTRIBUTION}</p>
          <nav aria-label="More" className="flex gap-4">
            <Link to="/method" className="hover:text-bone underline underline-offset-4">
              Methodology
            </Link>
            <Link to="/about" className="hover:text-bone underline underline-offset-4">
              Limitations
            </Link>
            <a href="/api/openapi.yaml" className="hover:text-bone underline underline-offset-4">
              Open API
            </a>
          </nav>
        </footer>
      </div>
    </div>
  )
}
