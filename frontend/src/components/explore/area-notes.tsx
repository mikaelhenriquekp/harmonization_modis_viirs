import { Info } from 'lucide-react'
import { Link } from 'react-router'

import type { CalendarResponse } from '@/api/types'
import { cn } from '@/lib/utils'

/** What to keep in mind when reading this area's numbers. */
export function AreaNotes({ data }: { data: CalendarResponse }) {
  return (
    <div className="grid gap-6 md:grid-cols-[1fr_minmax(0,22rem)]">
      <ul className="space-y-3 text-sm leading-relaxed">
        {data.notes.map((n) => (
          <li key={n} className="flex gap-3">
            <Info className="text-muted-foreground mt-0.5 size-4 shrink-0" aria-hidden />
            <span className="text-ink-2">{n}</span>
          </li>
        ))}
      </ul>
      {data.regions.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold">Countries in this area</h3>
          <ul className="mt-2 flex flex-wrap gap-1.5 text-xs">
            {data.regions.slice(0, 24).map((r) => (
              <li key={r.id}>
                <Link
                  to={`/validation?region=${encodeURIComponent(r.id)}`}
                  className={cn(
                    'border-line hover:border-gold inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1',
                  )}
                  title={r.warnings?.join(' ') || undefined}
                >
                  <span
                    aria-hidden
                    className="size-2 rounded-full"
                    style={{
                      background:
                        r.status !== 'ok'
                          ? 'var(--tone-none)'
                          : r.quality === 'review'
                            ? 'var(--tone-serious)'
                            : 'var(--tone-cool)',
                    }}
                  />
                  {r.name}
                  {r.status !== 'ok'
                    ? ' · no history'
                    : r.scope === 'regional'
                      ? ' · regional model'
                      : r.quality === 'review'
                        ? ' · to review'
                        : ''}
                </Link>
              </li>
            ))}
            {data.regions.length > 24 && (
              <li className="text-muted-foreground px-1 py-1">
                and {data.regions.length - 24} more
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  )
}
