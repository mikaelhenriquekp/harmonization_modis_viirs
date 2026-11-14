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

/** Find a ready-made place or any harmonized country. */
export function PlacePicker({
  regions,
  onPick,
}: {
  regions: RegionSummary[] | undefined
  onPick: (area: Area, name: string) => void
}) {
  const [query, setQuery] = useState('')
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
    <div>
      <label htmlFor={id} className="sr-only">
        Find a place or country
      </label>
      <div className="border-line bg-surface focus-within:border-gold flex items-center gap-2 rounded-full border px-3">
        <Search className="text-muted-foreground size-4" aria-hidden />
        <input
          id={id}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find a place or country"
          className="placeholder:text-muted-foreground h-10 w-full bg-transparent text-sm outline-none"
        />
      </div>
      <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Places">
        {options.map((o) => (
          <li key={o.id}>
            <button
              type="button"
              onClick={() => {
                onPick(o.area, o.name)
                setQuery('')
              }}
              className="border-line hover:border-gold rounded-full border px-3 py-1 text-left text-sm"
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
    </div>
  )
}
