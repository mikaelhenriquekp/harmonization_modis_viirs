import { useSearchParams } from 'react-router'

import { Card } from '@/components/card'
import { Mascot } from '@/components/mascot'
import { ErrorState, Loading } from '@/components/state'
import { RegionExam } from '@/components/validation/region-exam'
import { RegionsTable } from '@/components/validation/regions-table'
import { useRegion, useRegions } from '@/hooks/use-fire'

const STEPS = [
  [
    'Download',
    'Every FIRMS country file since 2002: MODIS Aqua, Suomi NPP and NOAA-20, plus the recent days from the area API, refreshed every six hours.',
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
    'Each model predicts 2018 to mid-2021 without looking; the lowest error within ±10% bias wins, country by country.',
  ],
  [
    'Rebuild',
    'The winner turns 2002–2012 MODIS into the VIIRS scale; countries with little fire borrow a model pooled with their neighbours.',
  ],
  [
    'Join',
    'One source per month, never added together: rebuilt MODIS to January 2012, Suomi NPP after, NOAA-20 since November 2026.',
  ],
]

/** How the record is harmonized, and every country's exam. */
export function MethodPage() {
  const [params, setParams] = useSearchParams()
  const regions = useRegions()
  const selected = params.get('region') ?? 'Spain'
  const region = useRegion(selected)

  return (
    <div className="mx-auto max-w-[1400px] space-y-20 px-4 py-10 sm:px-8">
      <header className="grid items-center gap-6 sm:grid-cols-[1fr_auto]">
        <div className="max-w-3xl">
          <p className="eyebrow">Methodology</p>
          <h1 className="mt-2 text-[38px] leading-[1.05] font-bold tracking-tight sm:text-[48px]">
            Two satellites, <span className="serif">one</span> record
          </h1>
          <p className="text-soft mt-4 text-[16px] leading-relaxed">
            Put side by side, the switch from MODIS to VIIRS in 2012 looks like an explosion of fire
            that never happened: VIIRS sees several times more small fires. Each country gets its
            own model, an exam it cannot cheat on, and a record in one single unit.
          </p>
        </div>
        <Mascot mood="calm" label="The mascot looks calm" className="mx-auto w-32 sm:w-40" />
      </header>

      <section aria-labelledby="steps-title">
        <h2 id="steps-title" className="mb-6 text-[28px] font-bold tracking-tight">
          How the record is <span className="serif">harmonized</span>
        </h2>
        <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {STEPS.map(([title, text], i) => (
            <li key={title}>
              <Card className="h-full p-5">
                <p className="text-saffron num font-mono text-[13px] font-semibold">
                  {String(i + 1).padStart(2, '0')}
                </p>
                <p className="mt-1 text-[17px] font-semibold">{title}</p>
                <p className="text-soft mt-1 text-[14px] leading-relaxed">{text}</p>
              </Card>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="countries-title">
        <h2 id="countries-title" className="text-[28px] font-bold tracking-tight">
          Every country, <span className="serif">graded</span>
        </h2>
        <p className="text-soft mt-2 mb-6 max-w-2xl text-[14px]">
          Pick a country to see how every model scored on the exam and how the 2012 switch looks
          before and after.
        </p>
        {regions.isError ? (
          <ErrorState error={regions.error} onRetry={() => void regions.refetch()} />
        ) : !regions.data ? (
          <Loading label="Loading countries" />
        ) : (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
            <Card className="p-4 sm:p-5">
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
            </Card>
            <Card className="min-w-0 p-4 sm:p-6">
              {region.isError ? (
                <ErrorState error={region.error} />
              ) : region.data ? (
                <RegionExam region={region.data} />
              ) : (
                <Loading label="Loading the exam" />
              )}
            </Card>
          </div>
        )}
      </section>
    </div>
  )
}
