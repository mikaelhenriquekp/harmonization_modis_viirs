import { MessageSquarePlus, MoonStar } from 'lucide-react'
import { useEffect, useMemo, useRef } from 'react'
import { useSearchParams } from 'react-router'

import { AskHero } from '@/components/ask/ask-hero'
import { Composer } from '@/components/ask/composer'
import { EmberField } from '@/components/ask/ember-field'
import { MessageList } from '@/components/ask/message-list'
import { TalkingMascot } from '@/components/ask/talking-mascot'
import {
  useAssistant,
  useAssistantStatus,
  type ChatMessage,
  type Phase,
} from '@/hooks/use-assistant'
import { contextFromSearch, describeContext, toolMeta } from '@/lib/ask'
import { cn } from '@/lib/utils'

function liveStatus(phase: Phase, messages: ChatMessage[]): string {
  const last = messages.at(-1)
  const running = last?.steps.filter((s) => s.state === 'running') ?? []
  switch (phase) {
    case 'working':
      return running.length > 1
        ? `Opening ${running.length} satellite uplinks…`
        : `${toolMeta(running[0]?.name ?? '').active}…`
    case 'thinking':
      return last?.steps.length ? 'Making sense of the data…' : 'Thinking…'
    case 'speaking':
      return 'Answering'
    default:
      return 'Ready'
  }
}

/** Ember, the fire analyst: ask the record anything. */
export function AskPage() {
  const [params, setParams] = useSearchParams()
  const context = useMemo(() => contextFromSearch(params), [params])
  const status = useAssistantStatus()
  const enabled = status.data?.enabled ?? false
  const chat = useAssistant(context)
  const { messages, phase, send, retry, stop, reset } = chat
  const empty = messages.length === 0
  const bottom = useRef<HTMLDivElement>(null)
  const pinned = useRef(true)

  // a link with ?q= asks right away, once
  const asked = useRef(false)
  useEffect(() => {
    const q = params.get('q')
    if (!q || asked.current || !enabled) return
    asked.current = true
    void send(q)
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.delete('q')
        return next
      },
      { replace: true },
    )
  }, [params, enabled, send, setParams])

  // follow the answer while the reader is at the bottom
  useEffect(() => {
    const onScroll = () => {
      pinned.current = window.innerHeight + window.scrollY >= document.body.scrollHeight - 160
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  useEffect(() => {
    if (pinned.current && !empty) bottom.current?.scrollIntoView?.({ block: 'end' })
  }, [messages, empty])

  const clearContext = () =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        for (const k of ['area', 'name', 'from', 'to']) next.delete(k)
        return next
      },
      { replace: true },
    )

  const onSend = (q: string) => {
    pinned.current = true
    void send(q)
  }

  const composer = (
    <Composer
      phase={phase}
      disabled={!enabled}
      contextLabel={context ? describeContext(context) : undefined}
      onClearContext={clearContext}
      onSend={onSend}
      onStop={stop}
      autoFocus={enabled}
    />
  )

  return (
    <div className="relative min-h-svh">
      <EmberField phase={phase} className="z-0" />
      <div
        aria-hidden
        className={cn(
          'pointer-events-none fixed inset-x-0 bottom-0 z-0 h-[45vh] transition-opacity duration-1000',
          phase === 'idle' ? 'opacity-50' : 'opacity-100',
        )}
        style={{
          background:
            'radial-gradient(60% 100% at 50% 100%, rgb(194 59 84 / 0.28), rgb(238 143 90 / 0.08) 50%, transparent 80%)',
        }}
      />

      <div className="relative z-10">
        {empty ? (
          <>
            <AskHero phase={phase} disabled={!enabled} onAsk={onSend} />
            <div className="mx-auto w-full max-w-3xl px-4 pb-16">
              {status.isSuccess && !enabled && (
                <p className="border-line bg-card/80 text-soft mb-4 flex items-center gap-2 rounded-[16px] border px-4 py-3 text-[14px]">
                  <MoonStar className="text-slate size-4 shrink-0" />
                  Ember is resting: no language model is configured on this server yet.
                </p>
              )}
              {composer}
              <Disclaimer />
            </div>
          </>
        ) : (
          <>
            <header className="bg-background/70 border-line sticky top-0 z-20 border-b backdrop-blur-xl">
              <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-2.5">
                <TalkingMascot phase={phase} className="size-11 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] leading-tight font-semibold">
                    Ember <span className="text-mute font-normal">· fire analyst</span>
                  </p>
                  <p
                    className={cn(
                      'truncate text-[12px]',
                      phase === 'idle' ? 'text-mute' : 'text-saffron',
                    )}
                    role="status"
                  >
                    <span
                      className={cn(
                        'mr-1.5 inline-block size-1.5 rounded-full align-middle',
                        phase === 'idle' ? 'bg-[var(--tone-cool)]' : 'bg-saffron animate-pulse',
                      )}
                    />
                    {liveStatus(phase, messages)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={reset}
                  className="text-soft hover:text-bone hover:bg-card-2 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] transition-colors"
                >
                  <MessageSquarePlus className="size-4" />
                  <span className="hidden sm:inline">New chat</span>
                </button>
              </div>
            </header>

            <div className="mx-auto w-full max-w-3xl px-4 pt-8 pb-64">
              <MessageList messages={messages} phase={phase} onRetry={(q) => void retry(q)} />
              <div ref={bottom} />
            </div>

            <div className="fixed inset-x-0 bottom-[calc(64px+env(safe-area-inset-bottom))] z-30 md:bottom-0 md:left-[88px]">
              <div className="from-background via-background/80 pointer-events-none absolute inset-x-0 -top-10 bottom-0 bg-gradient-to-t to-transparent" />
              <div className="relative mx-auto w-full max-w-3xl px-4 pb-4 md:pb-6">
                {composer}
                <Disclaimer />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function Disclaimer() {
  return (
    <p className="text-mute mt-2.5 text-center text-[11px] leading-snug">
      Ember answers from Ctrl + Fire&rsquo;s harmonized NASA FIRMS record and can still get things
      wrong. Hotspots are satellite detections, not fires.
    </p>
  )
}
