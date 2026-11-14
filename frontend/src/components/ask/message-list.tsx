import { RotateCcw, TriangleAlert } from 'lucide-react'
import { memo } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

import head from '@/assets/mascot/head.png'
import type { ChatMessage, Phase } from '@/hooks/use-assistant'
import { cn } from '@/lib/utils'

import { DataCards } from './data-cards'
import { ToolSteps } from './tool-steps'

const Prose = memo(function Prose({ text }: { text: string }) {
  return (
    <Markdown
      remarkPlugins={[remarkGfm]}
      components={{
        a: ({ href, children }) => (
          <a href={href} target="_blank" rel="noreferrer noopener">
            {children}
          </a>
        ),
        table: ({ children }) => (
          <div className="overflow-x-auto">
            <table>{children}</table>
          </div>
        ),
      }}
    >
      {text}
    </Markdown>
  )
})

function UserBubble({ m }: { m: ChatMessage }) {
  return (
    <div className="ember-rise flex justify-end">
      <p className="from-garnet/90 to-coral/80 text-bone max-w-[85%] rounded-[22px] rounded-br-[6px] bg-gradient-to-br px-4 py-2.5 text-[15px] leading-relaxed whitespace-pre-wrap shadow-[0_12px_30px_-14px_rgb(194_59_84/0.8)]">
        {m.content}
      </p>
    </div>
  )
}

function Thinking() {
  return (
    <p className="text-soft flex items-center gap-2 text-[14px]" role="status">
      <span className="flex gap-1" aria-hidden>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="bg-saffron size-1.5 animate-bounce rounded-full"
            style={{ animationDelay: `${i * 120}ms` }}
          />
        ))}
      </span>
      <span className="ember-shimmer-text">Ember is thinking</span>
    </p>
  )
}

function AssistantTurn({
  m,
  live,
  phase,
  onRetry,
}: {
  m: ChatMessage
  live: boolean
  phase: Phase
  onRetry?: () => void
}) {
  const streaming = m.status === 'streaming'
  return (
    <div className="ember-rise flex gap-3 sm:gap-4">
      <span
        className={cn(
          'bg-card-2 border-line relative grid size-9 shrink-0 place-items-center rounded-[12px] border sm:size-10',
          streaming && 'shadow-[0_0_24px_-2px_rgb(238_143_90/0.6)]',
        )}
      >
        <img src={head} alt="" className="size-7 sm:size-8" />
        {streaming && (
          <span className="bg-saffron absolute -right-0.5 -bottom-0.5 size-2.5 animate-pulse rounded-full ring-2 ring-[var(--bg)]" />
        )}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-4 pt-1">
        <ToolSteps steps={m.steps} />
        <DataCards cards={m.cards} />
        {m.content ? (
          <div className={cn('ember-prose', live && phase === 'speaking' && 'ember-caret-last')}>
            <Prose text={m.content} />
          </div>
        ) : (
          streaming && m.steps.every((s) => s.state !== 'running') && <Thinking />
        )}
        {m.status === 'error' && (
          <div className="border-garnet/40 flex flex-wrap items-center gap-3 rounded-[14px] border bg-[rgb(194_59_84/0.08)] px-3.5 py-2.5 text-[13.5px]">
            <TriangleAlert className="text-coral size-4 shrink-0" />
            <span className="min-w-0 flex-1">{m.error ?? 'Ember could not answer.'}</span>
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="text-saffron hover:bg-saffron-soft inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-medium"
              >
                <RotateCcw className="size-3.5" /> Try again
              </button>
            )}
          </div>
        )}
        {m.status === 'stopped' && <p className="text-mute text-[12px]">Stopped.</p>}
      </div>
    </div>
  )
}

interface MessageListProps {
  messages: ChatMessage[]
  phase: Phase
  onRetry: (question: string) => void
}

/** The conversation: the user's questions and Ember's answers. */
export function MessageList({ messages, phase, onRetry }: MessageListProps) {
  return (
    <div className="flex flex-col gap-8" aria-live="polite" aria-busy={phase !== 'idle'}>
      {messages.map((m, i) => {
        if (m.role === 'user') return <UserBubble key={m.id} m={m} />
        const question = messages[i - 1]?.role === 'user' ? messages[i - 1].content : ''
        const last = i === messages.length - 1
        return (
          <AssistantTurn
            key={m.id}
            m={m}
            live={last}
            phase={phase}
            onRetry={last && question ? () => onRetry(question) : undefined}
          />
        )
      })}
    </div>
  )
}
