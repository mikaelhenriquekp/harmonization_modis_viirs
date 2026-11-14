import { useMemo } from 'react'
import { useSearchParams } from 'react-router'

import { SensorsChart } from '@/components/charts/sensors-chart'
import { PlacePicker } from '@/components/explore/place-picker'
import { Mascot } from '@/components/mascot'
import { ErrorState, Loading, Section } from '@/components/state'
import { JumpTiles } from '@/components/validation/jump-tiles'
import { RegionExam } from '@/components/validation/region-exam'
import { RegionsTable } from '@/components/validation/regions-table'
import { useExploreParams } from '@/hooks/use-explore-params'
import { useRegion, useRegions, useSensors } from '@/hooks/use-fire'
import { jumps } from '@/lib/jumps'

const STEPS = [
  [
    'Download',
    'Every FIRMS country file since 2002: MODIS Aqua, Suomi NPP and NOAA-20, plus the recent days from the area API.',
  ],
  [
    'Clean',
    'Vegetation fires only, enough confidence, Aqua for MODIS (its afternoon pass matches VIIRS), counted per 0.25° cell and month.',
  ],
  [
    'Learn',
    'Where both satellites flew (2012–2017), seven models learn how many hotspots VIIRS sees for each one MODIS sees.',
  ],
  [
    'Grade',
    'Each model predicts 2018 to mid-2021 without looking; the lowest error within ±10% bias wins, per country.',
  ],
  [
    'Rebuild',
    'The winner turns 2002–2012 MODIS into the VIIRS scale; small countries borrow a model pooled with their neighbours.',
  ],
  [
    'Join',
    'One source per month, never added together: rebuilt MODIS to January 2012, Suomi NPP after, NOAA-20 since November 2026.',
  ],
]

export function ValidationPage() {
  const [{ area, name }, update] = useExploreParams()
  const [params, setParams] = useSearchParams()
  const sensors = useSensors(area, {})
  const regions = useRegions()
  const selected = params.get('region') ?? 'Spain'
  const region = useRegion(selected)
  const jump = useMemo(() => (sensors.data ? jumps(sensors.data) : null), [sensors.data])
  const ratios = sensors.data?.ratios

  return (
    <div className="mx-auto max-w-[1200px] space-y-16 px-4 py-8 sm:px-6">
      <header className="grid items-center gap-6 sm:grid-cols-[1fr_auto]">
        <div className="max-w-3xl">
          <h1 className="text-[clamp(2rem,5vw,3.5rem)] leading-[1.05] font-semibold tracking-tight">
            Two satellites, one record
          </h1>
          <p className="text-ink-2 mt-4 text-lg leading-relaxed">
            MODIS has watched fires since 2000 with 1 km pixels. VIIRS arrived in 2012 with 375 m
            pixels and sees several times more of them. Put side by side, the switch looks like an
            explosion of fire that never happened. Harmonizing puts the whole record in one unit, so
            the sensor no longer matters.
          </p>
        </div>
        <Mascot mood="calm" label="The mascot looks calm" className="mx-auto w-32 sm:w-40" />
      </header>

      <Section
        id="sensors"
        title={`The switch, seen in ${name}`}
        description="Raw yearly hotspots of each satellite next to the harmonized series. Pick another area to check it anywhere."
      >
        <div className="mb-4 max-w-2xl">
          <PlacePicker regions={regions.data} onPick={(a, n) => update({ area: a, name: n })} />
        </div>
        {sensors.isError ? (
          <ErrorState error={sensors.error} onRetry={() => void sensors.refetch()} />
        ) : !sensors.data || !jump ? (
          <Loading label="Comparing the satellites" />
        ) : (
          <div className="space-y-6">
            <SensorsChart data={sensors.data} />
            <JumpTiles jumps={jump} />
            <p className="text-muted-foreground tabular text-sm">
              Where both flew, Suomi NPP saw{' '}
              {ratios?.snpp_over_aqua ? `×${ratios.snpp_over_aqua.toFixed(2)}` : '–'} the hotspots
              MODIS Aqua saw in this area; NOAA-20 saw{' '}
              {ratios?.n20_over_snpp ? `×${ratios.n20_over_snpp.toFixed(2)}` : '–'} what Suomi NPP
              saw, so the hand-over to NOAA-20 keeps the same scale.
            </p>
          </div>
        )}
      </Section>

      <Section id="method" title="How the record is harmonized">
        <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {STEPS.map(([title, text], i) => (
            <li key={title} className="border-line rounded-xl border p-4">
              <p className="text-gold-ink tabular text-sm font-semibold">{i + 1}</p>
              <p className="mt-1 font-semibold">{title}</p>
              <p className="text-muted-foreground mt-1 text-sm leading-relaxed">{text}</p>
            </li>
          ))}
        </ol>
      </Section>

      <Section
        id="countries"
        title="Every country, graded"
        description="Each country gets its own model and an exam it cannot cheat on. Pick one to see how every model scored."
      >
        {regions.isError ? (
          <ErrorState error={regions.error} onRetry={() => void regions.refetch()} />
        ) : !regions.data ? (
          <Loading label="Loading countries" />
        ) : (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
            <RegionsTable
              regions={regions.data}
              selected={selected}
              onSelect={(id) =>
                setParams(
                  (p) => {
                    const next = new URLSearchParams(p)
                    next.set('region', id)
                    return next
                  },
                  { replace: true },
                )
              }
            />
            <div className="min-w-0">
              {region.isError ? (
                <ErrorState error={region.error} />
              ) : region.data ? (
                <RegionExam region={region.data} />
              ) : (
                <Loading label="Loading the exam" />
              )}
            </div>
          </div>
        )}
      </Section>
    </div>
  )
}
