import { useId, useMemo, useState } from 'react'

import type { RegionSummary } from '@/api/types'
import { cn } from '@/lib/utils'

type Filter = 'all' | 'good' | 'review' | 'regional' | 'none'

const FILTERS: { value: Filter; label: string; test: (r: RegionSummary) => boolean }[] = [
  { value: 'all', label: 'All', test: () => true },
  { value: 'good', label: 'Good', test: (r) => r.status === 'ok' && r.quality === 'good' },
  { value: 'review', label: 'To review', test: (r) => r.status === 'ok' && r.quality === 'review' },
  { value: 'regional', label: 'Regional model', test: (r) => r.scope === 'regional' },
  { value: 'none', label: 'No model', test: (r) => r.status !== 'ok' },
]

function statusText(r: RegionSummary): string {
  if (r.status === 'insufficient_data') return 'Too little fire'
  if (r.status === 'pending') return 'Not ingested yet'
  if (r.status === 'error') return 'Ingest failed'
  return r.quality === 'review' ? 'To review' : 'Good'
}

/** Every country, its harmonization model and quality. */
export function RegionsTable({
  regions,
  selected,
  onSelect,
}: {
  regions: RegionSummary[]
  selected: string | undefined
  onSelect: (id: string) => void
}) {
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const searchId = useId()
  const counts = useMemo(
    () => Object.fromEntries(FILTERS.map((f) => [f.value, regions.filter(f.test).length])),
    [regions],
  )
  const rows = useMemo(() => {
    const test = FILTERS.find((f) => f.value === filter)!.test
    const q = query.trim().toLowerCase()
    return regions.filter((r) => test(r) && (!q || r.name.toLowerCase().includes(q)))
  }, [regions, filter, query])

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <fieldset className="flex flex-wrap gap-1.5 text-xs">
          <legend className="sr-only">Show</legend>
          {FILTERS.map((f) => (
            <label
              key={f.value}
              className="border-line has-[:checked]:bg-surface-2 has-[:checked]:text-foreground text-muted-foreground cursor-pointer rounded-full border px-2.5 py-1 has-[:focus-visible]:outline-2"
            >
              <input
                type="radio"
                name="region-filter"
                className="sr-only"
                checked={filter === f.value}
                onChange={() => setFilter(f.value)}
              />
              {f.label} ({counts[f.value]})
            </label>
          ))}
        </fieldset>
        <label htmlFor={searchId} className="sr-only">
          Search countries
        </label>
        <input
          id={searchId}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search countries"
          className="border-line bg-surface ml-auto h-8 rounded-full border px-3 text-sm"
        />
      </div>
      <div className="border-line max-h-[520px] overflow-auto rounded-xl border">
        <table className="w-full text-left text-sm">
          <thead className="bg-surface text-muted-foreground sticky top-0 text-xs">
            <tr>
              <th scope="col" className="px-3 py-2 font-medium">
                Country
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                Model
              </th>
              <th scope="col" className="hidden px-3 py-2 font-medium sm:table-cell">
                Learned from
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                Quality
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.id}
                className={cn('border-line border-t', selected === r.id && 'bg-surface-2')}
              >
                <th scope="row" className="px-3 py-1.5 font-normal">
                  <button
                    type="button"
                    onClick={() => onSelect(r.id)}
                    className="hover:text-gold-ink text-left underline-offset-4 hover:underline"
                  >
                    {r.name}
                  </button>
                </th>
                <td className="px-3 py-1.5">
                  {r.model ? `${r.model} · ${r.model_name ?? ''}` : '–'}
                </td>
                <td className="text-muted-foreground hidden px-3 py-1.5 sm:table-cell">
                  {r.scope === 'regional'
                    ? `With ${r.pooled_with.join(', ')}`
                    : r.status === 'ok'
                      ? 'Its own fire'
                      : '–'}
                </td>
                <td className="px-3 py-1.5">
                  <span className="inline-flex items-center gap-1.5">
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
                    {statusText(r)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
