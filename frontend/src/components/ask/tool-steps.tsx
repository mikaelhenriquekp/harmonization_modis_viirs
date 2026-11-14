import { Check, Satellite, TriangleAlert } from 'lucide-react'

import type { ToolStep } from '@/hooks/use-assistant'
import { describeArgs, toolMeta } from '@/lib/ask'
import { cn } from '@/lib/utils'

/** The uplinks Ember opened to answer: one chip per tool call. */
export function ToolSteps({ steps }: { steps: ToolStep[] }) {
  if (steps.length === 0) return null
  return (
    <ol aria-label="Data Ember looked at" className="flex flex-wrap gap-2">
      {steps.map((s, i) => {
        const meta = toolMeta(s.name)
        const detail = describeArgs(s.args)
        const running = s.state === 'running'
        return (
          <li
            key={s.id || i}
            className={cn(
              'ember-rise relative flex max-w-full items-center gap-2 overflow-hidden rounded-full border py-1.5 pr-3.5 pl-1.5 text-[12.5px]',
              running && 'border-saffron/40 bg-[rgb(240_192_72/0.07)]',
              s.state === 'ok' && 'border-line bg-card-2/70',
              s.state === 'error' && 'border-garnet/40 bg-[rgb(194_59_84/0.08)]',
            )}
            style={{ animationDelay: `${i * 60}ms` }}
          >
            {running && <span aria-hidden className="ember-scan" />}
            <span
              className={cn(
                'grid size-6 shrink-0 place-items-center rounded-full',
                running && 'bg-saffron text-on-accent',
                s.state === 'ok' && 'bg-[rgb(240_192_72/0.15)] text-saffron',
                s.state === 'error' && 'bg-garnet/20 text-coral',
              )}
            >
              {running ? (
                <Satellite className="size-3.5 animate-pulse" />
              ) : s.state === 'ok' ? (
                <Check className="size-3.5" strokeWidth={3} />
              ) : (
                <TriangleAlert className="size-3.5" />
              )}
            </span>
            <span className={cn('font-medium whitespace-nowrap', running && 'ember-shimmer-text')}>
              {running ? `${meta.active}…` : meta.done}
            </span>
            {detail && <span className="text-mute truncate font-mono text-[11px]">{detail}</span>}
            {s.state === 'ok' && s.elapsedMs !== undefined && (
              <span className="text-mute num shrink-0 font-mono text-[10.5px]">
                {(s.elapsedMs / 1000).toFixed(1)}s
              </span>
            )}
            <span className="sr-only">
              {running
                ? 'running'
                : s.state === 'ok'
                  ? 'done'
                  : `failed${s.error ? `: ${s.error}` : ''}`}
            </span>
          </li>
        )
      })}
    </ol>
  )
}
