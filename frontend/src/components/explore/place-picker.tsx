import { Search } from 'lucide-react'
import { useId, useMemo, useState } from 'react'

import type { RegionSummary } from '@/api/types'
import type { Area } from '@/lib/area'
import { PLACES } from '@/lib/places'

interface Option {
  id: string
  name: string
  note: string
  area: Area
}

function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
}

/**
 * Find a ready-made place or any harmonized country. Compact pickers only
 * list places while the search is in use.
 */
export function PlacePicker({
  regions,
  onPick,
  compact = false,
}: {
  regions: RegionSummary[] | undefined
  onPick: (area: Area, name: string) => void
  compact?: boolean
}) {
  const [query, setQuery] = useState('')
  const [focused, setFocused] = useState(false)
  const id = useId()
  const options = useMemo<Option[]>(() => {
    const countries: Option[] = (regions ?? [])
      .filter((r) => r.status === 'ok' && r.bbox)
      .map((r) => ({
        id: r.id,
        name: r.name,
        note: r.scope === 'regional' ? 'Country, regional model' : 'Country',
        area: {
          kind: 'bbox',
          west: r.bbox![0],
          south: r.bbox![1],
          east: r.bbox![2],
          north: r.bbox![3],
        },
      }))
    const q = normalize(query.trim())
    if (!q) return PLACES
    return [...PLACES, ...countries].filter((o) => normalize(o.name).includes(q)).slice(0, 8)
  }, [regions, query])

  return (
    // the list stays open while the focus is anywhere inside, so Tab reaches it
    <div
      onFocus={() => setFocused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setFocused(false)
      }}
    >
      <label htmlFor={id} className="sr-only">
        Find a place or country
      </label>
      <div className="border-line bg-surface focus-within:border-saffron flex items-center gap-2 rounded-full border px-3">
        <Search className="text-muted-foreground size-4" aria-hidden />
        <input
          id={id}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setQuery('')
              e.currentTarget.blur()
            }
          }}
          placeholder="Find a place or country"
          className="placeholder:text-muted-foreground h-10 w-full bg-transparent text-sm outline-none"
        />
      </div>
      {(!compact || focused || query) && (
        <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Places">
          {options.map((o) => (
            <li key={o.id}>
              <button
                type="button"
                // keep the focus in the search, or the list closes before the click lands
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onPick(o.area, o.name)
                  setQuery('')
                  if (compact) (document.activeElement as HTMLElement | null)?.blur()
                }}
                className="border-line hover:border-saffron rounded-full border px-3 py-1 text-left text-sm"
                title={o.note}
              >
                {o.name}
              </button>
            </li>
          ))}
          {options.length === 0 && (
            <li className="text-muted-foreground px-1 py-1 text-sm">
              No place or country with that name.
            </li>
          )}
        </ul>
      )}
    </div>
  )
}
