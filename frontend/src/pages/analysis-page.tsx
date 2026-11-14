import { ChevronRight } from 'lucide-react'
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
import { ErrorState, Skeleton } from '@/components/state'
import { useExploreParams } from '@/hooks/use-explore-params'
import { useCalendar, useRegion, useSensors } from '@/hooks/use-fire'

function Heading({
  id,
  children,
  description,
  actions,
}: {
  id: string
  children: ReactNode
  description?: ReactNode
  actions?: ReactNode
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h2 id={id} className="text-[28px] leading-[1.1] font-bold tracking-tight sm:text-[32px]">
          {children}
        </h2>
        {description && <p className="text-soft mt-2 max-w-2xl text-[14px]">{description}</p>}
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
              <Heading
                id="calendar-title"
                description={`Harmonized hotspots per month, ${cal.grid.years[0]} to ${cal.grid.years.at(-1)}. Newest year on top.`}
              >
                Burn calendar
              </Heading>
              <Card className={`p-4 sm:p-6 ${calendar.isFetching ? 'opacity-70' : ''}`}>
                <CalendarTable calendar={cal} />
              </Card>
            </section>

            <section id="anomalies" className="scroll-mt-24" aria-labelledby="anomalies-title">
              <Heading
                id="anomalies-title"
                description="Each month against the same month in every other year of the record."
              >
                Is this <span className="serif">normal</span>?
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

            <section id="sensors" className="scroll-mt-24" aria-labelledby="sensors-title">
              <Satellites
                sensors={sensors.data}
                region={area.kind === 'world' ? undefined : region.data}
                lastYear={cal.grid.years.at(-1)!}
              />
            </section>

            <section id="downloads" className="scroll-mt-24" aria-labelledby="downloads-title">
              <Heading id="downloads-title">Downloads</Heading>
              <Downloads
                key={cal.data_until}
                area={area}
                range={range}
                dataUntil={cal.data_until}
              />
            </section>

            {data.notes.length > 0 && (
              <details className="group text-[13px]">
                <summary className="text-soft hover:text-bone flex cursor-pointer list-none items-center gap-2 font-semibold [&::-webkit-details-marker]:hidden">
                  <ChevronRight className="size-4 transition-transform group-open:rotate-90" />
                  Notes on these numbers ({data.notes.length})
                </summary>
                <ul className="text-soft mt-3 max-w-4xl list-disc space-y-2 pl-10 leading-relaxed">
                  {data.notes.map((n) => (
                    <li key={n}>{n.replaceAll('_', ' ')}</li>
                  ))}
                </ul>
              </details>
            )}
          </>
        )}

        <footer className="border-line text-mute flex flex-wrap items-start justify-between gap-4 border-t pt-6 text-[12px]">
          <p className="max-w-3xl leading-relaxed">{ATTRIBUTION}</p>
          <nav aria-label="More" className="flex gap-4">
            <Link to="/method" className="hover:text-bone underline underline-offset-4">
              Method
            </Link>
            <Link to="/about" className="hover:text-bone underline underline-offset-4">
              About the data
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
