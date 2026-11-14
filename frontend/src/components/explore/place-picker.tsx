import { Globe2, MapPin, Search } from 'lucide-react'
import { useId, useMemo, useState, type InputHTMLAttributes, type KeyboardEvent } from 'react'

import type { RegionSummary } from '@/api/types'
import type { Area } from '@/lib/area'
import { PLACES } from '@/lib/places'
import { cn } from '@/lib/utils'

interface Option {
  id: string
  name: string
  note: string
  kind: 'place' | 'country' | 'world'
  area: Area
}

function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
}

const READY: Option[] = PLACES.map((p) => ({
  ...p,
  kind: p.area.kind === 'world' ? 'world' : 'place',
}))

function useOptions(regions: RegionSummary[] | undefined, query: string): Option[] {
  return useMemo(() => {
    const q = normalize(query.trim())
    if (!q) return READY
    const countries: Option[] = (regions ?? [])
      .filter((r) => r.status === 'ok' && r.bbox)
      .map((r) => ({
        id: r.id,
        name: r.name,
        note: r.scope === 'regional' ? 'Country, regional model' : 'Country',
        kind: 'country',
        area: {
          kind: 'bbox',
          west: r.bbox![0],
          south: r.bbox![1],
          east: r.bbox![2],
          north: r.bbox![3],
        },
      }))
    return [...READY, ...countries].filter((o) => normalize(o.name).includes(q)).slice(0, 8)
  }, [regions, query])
}

interface PlacePickerProps {
  regions: RegionSummary[] | undefined
  onPick: (area: Area, name: string) => void
  /** A search field whose places open in a list under it, instead of chips always shown. */
  compact?: boolean
}

/** Find a ready-made place or any harmonized country. */
export function PlacePicker({ regions, onPick, compact = false }: PlacePickerProps) {
  return compact ? (
    <PlaceSearch regions={regions} onPick={onPick} />
  ) : (
    <PlaceChips regions={regions} onPick={onPick} />
  )
}

function SearchField({
  id,
  query,
  onQuery,
  className,
  ...aria
}: {
  id: string
  query: string
  onQuery: (q: string) => void
  className?: string
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'className'>) {
  return (
    <div
      className={cn(
        'border-line bg-card-2 hover:border-mute focus-within:border-saffron! flex h-11 items-center gap-2 rounded-full border px-3.5 transition-colors',
        className,
      )}
    >
      <Search className="text-mute size-4 shrink-0" aria-hidden />
      <label htmlFor={id} className="sr-only">
        Find a place or country
      </label>
      <input
        id={id}
        type="search"
        autoComplete="off"
        value={query}
        onChange={(e) => onQuery(e.target.value)}
        placeholder="Find a place or country"
        className="placeholder:text-mute h-full w-full bg-transparent text-[14px] outline-none [&::-webkit-search-cancel-button]:hidden"
        {...aria}
      />
    </div>
  )
}

/** A combobox: type to filter, arrows to move, Enter to pick, Escape to close. */
function PlaceSearch({ regions, onPick }: Omit<PlacePickerProps, 'compact'>) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const id = useId()
  const listId = `${id}-list`
  const options = useOptions(regions, query)
  const current = Math.min(active, Math.max(options.length - 1, 0))

  const pick = (o: Option) => {
    onPick(o.area, o.name)
    setQuery('')
    setOpen(false)
    ;(document.activeElement as HTMLElement | null)?.blur()
  }

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      setOpen(true)
      const d = e.key === 'ArrowDown' ? 1 : -1
      setActive((current + d + options.length) % Math.max(options.length, 1))
    } else if (e.key === 'Enter' && open && options[current]) {
      e.preventDefault()
      pick(options[current])
    } else if (e.key === 'Escape') {
      if (open) setOpen(false)
      else setQuery('')
    }
  }

  return (
    <div
      className="relative"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false)
      }}
    >
      <SearchField
        id={id}
        query={query}
        onQuery={(q) => {
          setQuery(q)
          setActive(0)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onKeyDown={onKey}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && options[current] ? `${id}-${current}` : undefined}
      />
      {open && (
        <div className="bg-card border-line absolute inset-x-0 top-full z-10 mt-2 overflow-hidden rounded-[16px] border p-1.5 shadow-[0_12px_32px_rgb(0_0_0/0.5)]">
          {!query.trim() && <p className="text-mute px-2.5 pt-1.5 pb-1 text-[12px]">Suggested</p>}
          <ul
            id={listId}
            role="listbox"
            aria-label="Places"
            className="max-h-80 overflow-y-auto [scrollbar-color:var(--line)_transparent] [scrollbar-width:thin]"
          >
            {options.map((o, i) => {
              const Icon = o.kind === 'place' ? MapPin : Globe2
              return (
                <li
                  key={o.id}
                  id={`${id}-${i}`}
                  role="option"
                  aria-selected={i === current}
                  // keep the focus in the search, or the list closes before the click lands
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseMove={() => setActive(i)}
                  onClick={() => pick(o)}
                  className={cn(
                    'flex cursor-pointer items-center gap-3 rounded-[10px] px-2.5 py-2 transition-colors',
                    i === current && 'bg-white/[0.06]',
                  )}
                >
                  <Icon
                    aria-hidden
                    className={cn('size-4 shrink-0', i === current ? 'text-saffron' : 'text-mute')}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px]">{o.name}</span>
                    <span className="text-mute block truncate text-[12px]">{o.note}</span>
                  </span>
                </li>
              )
            })}
          </ul>
          {options.length === 0 && (
            <p className="text-soft px-2.5 py-3 text-[13px]">
              No place or country called “{query.trim()}”. Or tap the map to pick any point.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

/** The search with every suggestion shown as a chip, for roomy dialogs. */
function PlaceChips({ regions, onPick }: Omit<PlacePickerProps, 'compact'>) {
  const [query, setQuery] = useState('')
  const id = useId()
  const options = useOptions(regions, query)
  return (
    <div>
      <SearchField id={id} query={query} onQuery={setQuery} />
      <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Places">
        {options.map((o) => (
          <li key={o.id}>
            <button
              type="button"
              onClick={() => {
                onPick(o.area, o.name)
                setQuery('')
              }}
              className="border-line hover:border-saffron rounded-full border px-3 py-1 text-left text-sm transition-colors"
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
