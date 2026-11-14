import { Link } from 'react-router'

import mascot from '@/assets/mascot.webp'
import { ATTRIBUTION } from '@/lib/attribution'
import { Section } from '@/components/state'
import { useCoverage } from '@/hooks/use-fire'
import { formatMonth } from '@/lib/format'

const LIMITS = [
  'Months up to January 2012 are rebuilt from MODIS Aqua: an estimate of what VIIRS would have seen. Use them for seasons and trends, not single fires.',
  'No hotspots means none were detected. Clouds, smoke and small or short fires can hide fire from both satellites.',
  'Recent months are provisional, and the current month is compared at its pace so far.',
  'Some country models are flagged for review (bias above ±10% or a weak monthly fit). Small countries share a model with neighbours. The Method page shows every exam.',
  'Areas are counted in 0.25° cells (about 25 km): a drawn shape keeps the cells whose center falls inside it. Raw hotspot downloads follow the exact shape.',
  'Terra is left out on purpose: only Aqua passes in the early afternoon like VIIRS, so the record starts in July 2002.',
]

const TEAM = [
  'Alexis Daniel Rodriguez Zambrano',
  'Maia Prieto',
  'Pablo Ruiz Inglés',
  'Basma Barhel Aousser',
  'Mikael Henrique Krüppel Pinto',
]

export function AboutPage() {
  const coverage = useCoverage()
  const c = coverage.data
  return (
    <div className="mx-auto max-w-[960px] space-y-14 px-4 py-10 sm:px-8">
      <header className="grid items-center gap-6 sm:grid-cols-[1fr_auto]">
        <div>
          <h1 className="text-[38px] leading-[1.05] font-bold tracking-tight sm:text-[48px]">
            Is this month&apos;s fire <span className="serif">normal</span>?
          </h1>
          <p className="text-soft mt-4 text-[16px] leading-relaxed">
            Ctrl + Fire answers that for any place on Earth. It joins NASA&apos;s MODIS and VIIRS
            fire hotspots since 2002 into one consistent burn calendar, for emergency teams, land
            managers and scientists.
          </p>
        </div>
        <img
          src={mascot}
          alt="The Ctrl + Fire mascot, a paparajote in an astronaut suit"
          className="hidden w-36 sm:block"
        />
      </header>

      <Section id="data" title="What is in it">
        <dl className="tabular grid gap-3 text-sm sm:grid-cols-3">
          <div className="bg-card border-line rounded-[16px] border p-4">
            <dt className="text-muted-foreground">Record</dt>
            <dd className="num mt-1 font-mono text-lg font-semibold">
              {c
                ? `${formatMonth(c.data_start, 'short')} – ${formatMonth((c.recent_last_day ?? c.archive_end).slice(0, 7), 'short')}`
                : '…'}
            </dd>
          </div>
          <div className="bg-card border-line rounded-[16px] border p-4">
            <dt className="text-muted-foreground">Countries harmonized</dt>
            <dd className="num mt-1 font-mono text-lg font-semibold">
              {c ? `${c.regions.harmonized} of ${c.regions.total}` : '…'}
            </dd>
          </div>
          <div className="bg-card border-line rounded-[16px] border p-4">
            <dt className="text-muted-foreground">Grid</dt>
            <dd className="num mt-1 font-mono text-lg font-semibold">
              {c ? `${c.cell_degrees}° (~25 km)` : '…'}
            </dd>
          </div>
        </dl>
        <p className="text-muted-foreground mt-4 text-sm">
          Updated every six hours. The same data is in the{' '}
          <a href="/api/openapi.yaml" className="text-saffron underline underline-offset-4">
            open API
          </a>
          , and the{' '}
          <Link to="/method" className="text-saffron underline underline-offset-4">
            Method
          </Link>{' '}
          page shows how it is built.
        </p>
      </Section>

      <Section id="limits" title="Limits">
        <ul className="text-ink-2 list-disc space-y-2 pl-5 text-sm leading-relaxed">
          {LIMITS.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      </Section>

      <Section id="sources" title="Data and credits">
        <p className="text-ink-2 text-sm leading-relaxed">{ATTRIBUTION}</p>
        <ul className="text-muted-foreground mt-3 space-y-1 text-sm">
          {(c?.citations ?? []).map((ct) => (
            <li key={ct}>{ct}</li>
          ))}
          <li>Basemaps © OpenStreetMap contributors, © CARTO.</li>
        </ul>
      </Section>

      <Section id="team" title="Team">
        <p className="text-ink-2 text-sm leading-relaxed">
          Built by team Paparajote Lunar in Murcia, home of the paparajote, for the NASA Space Apps
          Challenge 2026 (“Harmonization of MODIS and VIIRS Hot Spots”). The method comes from the
          study by Alexis Rodriguez and Basma Barhel.
        </p>
        <ul className="mt-3 flex flex-wrap gap-2 text-sm">
          {TEAM.map((t) => (
            <li key={t} className="bg-card border-line rounded-full border px-3 py-1">
              {t}
            </li>
          ))}
        </ul>
      </Section>

      <Section id="ai" title="Use of AI">
        <p className="text-ink-2 text-sm leading-relaxed">
          As the Space Apps rules ask, we declare that we used AI assistants (Anthropic’s Claude)
          while writing the harmonization study, the backend and this website. The team designed the
          method, checked the results against NASA data and is responsible for them.
        </p>
      </Section>
    </div>
  )
}
