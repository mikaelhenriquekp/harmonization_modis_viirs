import { Link } from 'react-router'

import mascot from '@/assets/mascot.webp'
import { ATTRIBUTION } from '@/lib/attribution'
import { Section } from '@/components/state'
import { useCoverage } from '@/hooks/use-fire'

const LIMITS = [
  'Months up to January 2012 are an estimate of what VIIRS would have seen, rebuilt from MODIS Aqua. They are good for seasonal patterns and trends, not for single fires.',
  'A month without hotspots means none were detected. Clouds, smoke, and small or short fires can hide fire from both satellites.',
  'The last months come from near real time data and are provisional; the current month is incomplete and compared at its current pace.',
  'Each country has its own model. Some are flagged for review (exam bias above ±10% or a weak monthly fit), and small countries use a model pooled with their neighbours. The Method page shows every country’s exam.',
  'Areas are counted in 0.25° cells (about 25 km). A drawn shape keeps the cells whose center falls inside it; raw hotspot downloads are cut to the exact shape.',
  'Terra is left out on purpose: Aqua passes in the early afternoon like VIIRS, so the two can be calibrated against each other. The record therefore starts in July 2002.',
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
          <h1 className="text-[clamp(2rem,5vw,3.25rem)] leading-[1.05] font-semibold tracking-tight">
            When and where fire burns
          </h1>
          <p className="text-ink-2 mt-4 text-lg leading-relaxed">
            Paparajote Lunar answers one question for any place on Earth: is the fire this month
            normal? It turns twenty-four years of NASA satellite hotspots into one consistent
            burning calendar, for emergency responders, land managers, firefighters and scientists.
          </p>
        </div>
        <img
          src={mascot}
          alt="The Paparajote Lunar mascot, a paparajote in an astronaut suit"
          className="mx-auto w-36 sm:w-44"
        />
      </header>

      <Section id="data" title="What is in it">
        <dl className="tabular grid gap-4 text-sm sm:grid-cols-3">
          <div className="bg-card border-line rounded-[20px] border p-4">
            <dt className="text-muted-foreground">Record</dt>
            <dd className="num mt-1 font-mono text-lg font-semibold">
              {c ? `${c.data_start} to ${c.recent_last_day ?? c.archive_end}` : '…'}
            </dd>
          </div>
          <div className="bg-card border-line rounded-[20px] border p-4">
            <dt className="text-muted-foreground">Countries harmonized</dt>
            <dd className="num mt-1 font-mono text-lg font-semibold">
              {c ? `${c.regions.harmonized} of ${c.regions.total}` : '…'}
            </dd>
          </div>
          <div className="bg-card border-line rounded-[20px] border p-4">
            <dt className="text-muted-foreground">Grid</dt>
            <dd className="num mt-1 font-mono text-lg font-semibold">
              {c ? `${c.cell_degrees}° cells` : '…'}
            </dd>
          </div>
        </dl>
        <p className="text-muted-foreground mt-4 text-sm">
          Updated every six hours. Developers can use the same data through the{' '}
          <a href="/api/openapi.yaml" className="text-saffron underline underline-offset-4">
            open API
          </a>
          ; see how it is built on the{' '}
          <Link to="/validation" className="text-saffron underline underline-offset-4">
            Validation
          </Link>{' '}
          page.
        </p>
      </Section>

      <Section id="limits" title="What to keep in mind">
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

      <Section id="team" title="Team Paparajote Lunar">
        <p className="text-ink-2 text-sm leading-relaxed">
          Built for the NASA Space Apps Challenge 2026, challenge “Harmonization of MODIS and VIIRS
          Hot Spots”, from Murcia, home of the paparajote. The harmonization method comes from the
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
