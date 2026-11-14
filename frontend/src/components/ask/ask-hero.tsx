import {
  ArrowUpRight,
  CalendarDays,
  Earth,
  Flame,
  Satellite,
  Scale,
  Trees,
  type LucideIcon,
} from 'lucide-react'

import type { Phase } from '@/hooks/use-assistant'
import { SUGGESTIONS, type SuggestionIcon } from '@/lib/ask'

import { TalkingMascot } from './talking-mascot'

const ICONS: Record<SuggestionIcon, LucideIcon> = {
  globe: Earth,
  flame: Flame,
  trees: Trees,
  calendar: CalendarDays,
  satellite: Satellite,
  compare: Scale,
}

/** The three satellites of the record, on their orbits around Ember. */
const ORBITS = [
  {
    name: 'Aqua · MODIS',
    size: 'size-[118%]',
    duration: '26s',
    color: 'var(--coral)',
    reverse: false,
  },
  {
    name: 'Suomi NPP · VIIRS',
    size: 'size-[138%]',
    duration: '34s',
    color: 'var(--saffron)',
    reverse: true,
  },
  {
    name: 'NOAA-20 · VIIRS',
    size: 'size-[158%]',
    duration: '44s',
    color: 'var(--slate)',
    reverse: false,
  },
]

/** Ember in orbit: the mascot, a fire aurora and the three satellites. */
export function EmberOrb({ phase, className }: { phase: Phase; className?: string }) {
  return (
    <div className={`relative grid place-items-center ${className ?? ''}`}>
      <div aria-hidden className="ember-aurora absolute size-[120%] rounded-full opacity-70" />
      <div
        aria-hidden
        className="ember-breathe absolute size-[92%] rounded-full"
        style={{
          background:
            'radial-gradient(closest-side, rgb(240 192 72 / 0.28), rgb(194 59 84 / 0.12) 60%, transparent)',
        }}
      />
      {ORBITS.map((o) => (
        <div
          key={o.name}
          aria-hidden
          className={`absolute ${o.size} rounded-full border border-dashed border-white/10 ${o.reverse ? 'ember-orbit-reverse' : 'ember-orbit'}`}
          style={{ ['--orbit-duration' as string]: o.duration }}
        >
          <span
            className="absolute top-1/2 -left-[5px] -mt-[5px] size-[10px] rounded-full"
            style={{ background: o.color, boxShadow: `0 0 14px 3px ${o.color}` }}
          />
        </div>
      ))}
      <TalkingMascot
        phase={phase}
        className="ember-float relative w-full drop-shadow-[0_20px_40px_rgb(194_59_84/0.45)]"
      />
    </div>
  )
}

interface AskHeroProps {
  phase: Phase
  disabled?: boolean
  onAsk: (question: string) => void
}

/** The empty chat: who Ember is and what to ask first. */
export function AskHero({ phase, disabled, onAsk }: AskHeroProps) {
  return (
    <section
      aria-labelledby="ask-title"
      className="mx-auto flex w-full max-w-5xl flex-col items-center px-4 pt-10 pb-8 text-center sm:pt-16"
    >
      <EmberOrb phase={phase} className="ember-rise mb-10 w-[170px] sm:mb-12 sm:w-[210px]" />

      <h1
        id="ask-title"
        className="ember-rise max-w-3xl text-[42px] leading-[0.98] font-bold tracking-[-0.035em] sm:text-[64px]"
        style={{ animationDelay: '100ms' }}
      >
        Ask the <span className="serif ember-gradient-text pr-1 font-normal">fire</span> anything.
      </h1>
      <p
        className="ember-rise text-soft mt-5 max-w-xl text-[16px] leading-relaxed sm:text-[17px]"
        style={{ animationDelay: '220ms' }}
      >
        Ember reads the harmonized MODIS and VIIRS record for you, from July 2002 to this
        morning&rsquo;s satellite passes, and answers in plain words, with the numbers to back it
        up.
      </p>

      <ul className="mt-10 grid w-full max-w-4xl grid-cols-1 gap-3 text-left sm:grid-cols-2 lg:grid-cols-3">
        {SUGGESTIONS.map((s, i) => {
          const Icon = ICONS[s.icon]
          return (
            <li
              key={s.title}
              className="ember-rise"
              style={{ animationDelay: `${320 + i * 70}ms` }}
            >
              <button
                type="button"
                disabled={disabled}
                onClick={() => onAsk(s.question)}
                className="group bg-card/70 border-line hover:border-coral/50 relative flex h-full w-full items-center gap-3 text-left overflow-hidden rounded-[18px] border p-4 backdrop-blur-md transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_18px_40px_-18px_rgb(238_143_90/0.55)] disabled:pointer-events-none disabled:opacity-50"
              >
                <span
                  aria-hidden
                  className="absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
                  style={{
                    background:
                      'radial-gradient(120% 80% at 0% 0%, rgb(238 143 90 / 0.14), transparent 60%)',
                  }}
                />
                <span className="bg-card-2 text-coral group-hover:text-saffron relative grid size-9 shrink-0 place-items-center rounded-[11px] transition-colors">
                  <Icon className="size-[18px]" />
                </span>
                <span className="relative min-w-0 flex-1 text-[14.5px] leading-snug font-medium">
                  {s.title}
                </span>
                <ArrowUpRight className="text-mute group-hover:text-saffron relative size-4 shrink-0 self-start transition-all group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
