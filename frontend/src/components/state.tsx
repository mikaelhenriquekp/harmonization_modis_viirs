import type { ReactNode } from 'react'

import silhouette from '@/assets/mascot/silhouette.png'
import { ApiError } from '@/api/client'
import { Mascot } from '@/components/mascot'
import { cn } from '@/lib/utils'

/** A placeholder block while data loads. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('bg-surface-2 animate-pulse rounded-lg', className)} />
}

/** Loading state with the mascot's silhouette. */
export function Loading({ label = 'Loading', className }: { label?: string; className?: string }) {
  return (
    <div
      role="status"
      className={cn('text-muted-foreground flex items-center gap-3 py-8 text-sm', className)}
    >
      <img src={silhouette} alt="" className="size-10 animate-pulse opacity-60" />
      {label}…
    </div>
  )
}

function messageOf(error: unknown): string {
  if (error instanceof ApiError) return error.message
  if (error instanceof Error && error.message) return error.message
  return 'Something went wrong.'
}

/** An error, said plainly, with a way out. */
export function ErrorState({
  error,
  onRetry,
  title = 'This could not be loaded',
}: {
  error: unknown
  onRetry?: () => void
  title?: string
}) {
  return (
    <div role="alert" className="border-line flex items-start gap-4 rounded-xl border p-4">
      <Mascot mood="worried" label="The mascot looks worried" className="size-14 shrink-0" />
      <div className="text-sm">
        <p className="font-medium">{title}</p>
        <p className="text-muted-foreground mt-1">{messageOf(error)}</p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="text-gold-ink mt-2 font-medium underline underline-offset-4"
          >
            Try again
          </button>
        )}
      </div>
    </div>
  )
}

/** Nothing to show yet, and what to do about it. */
export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex items-start gap-4 py-6">
      <Mascot mood="curious" label="The mascot is curious" className="size-14 shrink-0" />
      <div className="text-sm">
        <p className="font-medium">{title}</p>
        {children && <div className="text-muted-foreground mt-1">{children}</div>}
      </div>
    </div>
  )
}

/** A titled block of the page. */
export function Section({
  title,
  description,
  actions,
  children,
  className,
  id,
}: {
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
  id?: string
}) {
  return (
    <section
      id={id}
      aria-labelledby={id ? `${id}-title` : undefined}
      className={cn('scroll-mt-20', className)}
    >
      <div className="mb-4 flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div className="max-w-2xl">
          <h2
            id={id ? `${id}-title` : undefined}
            className="text-xl font-semibold tracking-tight sm:text-2xl"
          >
            {title}
          </h2>
          {description && (
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">{description}</p>
          )}
        </div>
        {actions}
      </div>
      {children}
    </section>
  )
}
