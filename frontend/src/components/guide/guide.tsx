import { MessageCircle, X } from 'lucide-react'
import { useEffect, useId, useState } from 'react'

import head from '@/assets/mascot/head.png'
import { Mascot } from '@/components/mascot'
import { useExploreParams } from '@/hooks/use-explore-params'
import { useCalendar, useSensors } from '@/hooks/use-fire'
import { GUIDE_TOPICS, guideMood, type GuideContext } from '@/lib/guide'
import { cn } from '@/lib/utils'

const HELLO =
  'Hi! I am the paparajote of the mission. Ask me about the place on screen and I will read you what the record says.'

/** How long the mouth moves for an answer: longer text, longer talk. */
function talkTime(text: string): number {
  return Math.min(4000, 600 + text.length * 12)
}

/** The mascot as a guide: fixed questions, answers read from the data on screen. */
export function Guide() {
  const [open, setOpen] = useState(false)
  const [asked, setAsked] = useState<string | null>(null)
  // the last text the mascot finished saying
  const [spoken, setSpoken] = useState<string | null>(null)
  const panelId = useId()
  const [{ area, name, from, to }] = useExploreParams()
  // the same queries the dashboard makes, so they come from the cache there
  const calendar = useCalendar(area, { from, to })
  const sensors = useSensors(area, { from, to })
  const context: GuideContext = {
    name,
    calendar: calendar.data?.calendar,
    ratio: sensors.data?.ratios.snpp_over_aqua,
  }
  const topic = GUIDE_TOPICS.find((t) => t.id === asked)
  const text = topic ? topic.answer(context) : HELLO

  const talking = open && spoken !== text

  useEffect(() => {
    if (!open) return
    const timer = setTimeout(() => setSpoken(text), talkTime(text))
    return () => clearTimeout(timer)
  }, [open, text])

  return (
    <div className="fixed right-3 bottom-3 z-[650] flex flex-col items-end gap-2 sm:right-5 sm:bottom-5">
      {open && (
        <section
          id={panelId}
          aria-label="Paparajote, your guide"
          className="bg-card border-line flex max-h-[min(560px,calc(100svh-6rem))] w-[min(360px,calc(100vw-1.5rem))] flex-col rounded-[20px] border shadow-2xl"
        >
          <header className="border-line flex items-center gap-3 border-b px-4 py-3">
            <Mascot
              mood={guideMood(context)}
              talking={talking}
              label="The paparajote mascot"
              className="w-14 shrink-0"
            />
            <div className="min-w-0 flex-1">
              <p className="text-[15px] leading-tight font-semibold">Paparajote</p>
              <p className="text-mute truncate text-[11px]">Looking at {name}</p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="text-soft grid size-9 place-items-center rounded-full hover:bg-white/5"
            >
              <X className="size-5" />
            </button>
          </header>
          <div className="space-y-3 overflow-y-auto p-4">
            {topic && (
              <p className="bg-saffron-soft text-saffron ml-auto w-fit max-w-[85%] rounded-[14px] rounded-br-[4px] px-3 py-2 text-[13px] font-semibold">
                {topic.question}
              </p>
            )}
            <p
              aria-live="polite"
              className="bg-card-2 max-w-[92%] rounded-[14px] rounded-bl-[4px] px-3 py-2.5 text-[13px] leading-relaxed"
            >
              {text}
            </p>
            <ul className="flex flex-wrap gap-1.5 pt-1" aria-label="Questions you can ask">
              {GUIDE_TOPICS.filter((t) => t.id !== asked).map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => setAsked(t.id)}
                    className="border-line hover:border-saffron rounded-full border px-3 py-1.5 text-left text-[12px]"
                  >
                    {t.question}
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <p className="border-line text-mute border-t px-4 py-2 text-[10px] leading-snug">
            Guided answers, read from the data on screen. No generative AI: nothing here is made up.
          </p>
        </section>
      )}
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={open ? 'Close the guide' : 'Ask Paparajote'}
        title={open ? 'Close the guide' : 'Ask Paparajote'}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'bg-card border-line relative grid size-14 place-items-center rounded-full border shadow-xl',
          open && 'border-saffron',
        )}
      >
        <img src={head} alt="" className="size-11" />
        <span className="bg-saffron absolute -top-0.5 -right-0.5 grid size-5 place-items-center rounded-full text-[#100d0f]">
          <MessageCircle className="size-3" />
        </span>
      </button>
    </div>
  )
}
