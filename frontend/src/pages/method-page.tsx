import { useRef } from 'react'
import { Link, useSearchParams } from 'react-router'

import { Card } from '@/components/card'
import { Mascot } from '@/components/mascot'
import { ErrorState, Loading } from '@/components/state'
import { RegionExam } from '@/components/validation/region-exam'
import { RegionsTable } from '@/components/validation/regions-table'
import { useRegion, useRegions } from '@/hooks/use-fire'

const STEPS = [
  [
    'Download',
    'Every FIRMS fire file since 2002 for MODIS Aqua, Suomi NPP and NOAA-20, refreshed every six hours.',
  ],
  [
    'Clean',
    'Keep confident vegetation fires, counted per 0.25° cell and month. MODIS means Aqua, whose afternoon pass matches VIIRS.',
  ],
  [
    'Learn',
    'On 2012–2017, when both flew, seven models learn how many VIIRS hotspots match each MODIS one.',
  ],
  ['Grade', 'Each model predicts 2018 to mid-2021 blind. The lowest error within ±10% bias wins.'],
  [
    'Rebuild',
    'The winner turns 2002–2012 MODIS into VIIRS units. Countries with little fire share a model with neighbours.',
  ],
  [
    'Join',
    'One satellite per month, never added: rebuilt MODIS to January 2012, Suomi NPP after, NOAA-20 since November 2026.',
  ],
]

/** How the record is harmonized, and every country's exam. */
export function MethodPage() {
  const [params, setParams] = useSearchParams()
  const regions = useRegions()
  const selected = params.get('region') ?? 'Spain'
  const region = useRegion(selected)
  const exam = useRef<HTMLDivElement>(null)

  return (
    <div className="mx-auto max-w-[1400px] space-y-16 px-4 py-10 sm:px-8">
      <header className="grid items-center gap-6 sm:grid-cols-[1fr_auto]">
        <div className="max-w-2xl">
          <h1 className="text-[38px] leading-[1.05] font-bold tracking-tight sm:text-[48px]">
            How the record is <span className="serif">built</span>
          </h1>
          <p className="text-soft mt-4 text-[16px] leading-relaxed">
            VIIRS sees several times more small fires than MODIS, so a plain join makes 2012 look
            like an explosion of fire that never happened. Each country gets its own conversion
            model, tested on years it never saw.
          </p>
        </div>
        <Mascot mood="calm" label="The mascot looks calm" className="hidden w-36 sm:block" />
      </header>

      <section aria-label="Steps">
        <ol className="grid gap-x-8 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
          {STEPS.map(([title, text], i) => (
            <li key={title} className="border-line border-t pt-4">
              <p className="flex items-baseline gap-3">
                <span className="text-saffron num font-mono text-[13px] font-semibold">
                  {i + 1}
                </span>
                <span className="text-[17px] font-semibold">{title}</span>
              </p>
              <p className="text-soft mt-2 text-[14px] leading-relaxed">{text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="countries-title">
        <h2 id="countries-title" className="text-[28px] font-bold tracking-tight">
          Every country&apos;s <span className="serif">exam</span>
        </h2>
        <p className="text-soft mt-2 mb-6 max-w-2xl text-[14px]">
          Pick a country to see how each model scored and which one was chosen.
        </p>
        {regions.isError ? (
          <ErrorState error={regions.error} onRetry={() => void regions.refetch()} />
        ) : !regions.data ? (
          <Loading label="Loading countries" />
        ) : (
          <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
            <Card className="p-4 sm:p-5">
              <RegionsTable
                regions={regions.data}
                selected={selected}
                onSelect={(id) => {
                  setParams(
                    (p) => {
                      const next = new URLSearchParams(p)
                      next.set('region', id)
                      return next
                    },
                    { replace: true },
                  )
                  // on one column the exam sits below the list: bring it into view
                  if (window.matchMedia?.('(max-width: 1023px)').matches)
                    exam.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                }}
              />
            </Card>
            <Card ref={exam} className="min-w-0 scroll-mt-4 p-4 sm:p-6">
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

      <p className="text-soft border-line border-t pt-6 text-[14px]">
        Limits, sources and the team are on the{' '}
        <Link to="/about" className="text-saffron underline underline-offset-4">
          About
        </Link>{' '}
        page.
      </p>
    </div>
  )
}
