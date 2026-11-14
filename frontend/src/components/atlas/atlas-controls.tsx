import { useId } from 'react'

import type { MapLayer } from '@/components/explore/area-map'
import { BASEMAPS, hasImagery, type Basemap } from '@/lib/basemaps'
import { RESOLUTIONS, type ResolutionChoice } from '@/lib/viewport'
import { cn } from '@/lib/utils'

interface Option<T> {
  value: T
  label: string
  title?: string
}

/** A row of choices where exactly one is on: radio buttons that look like a pill switch. */
export function Segmented<T extends string | number>({
  legend,
  options,
  value,
  onChange,
  className,
}: {
  legend: string
  options: Option<T>[]
  value: T
  onChange: (v: T) => void
  className?: string
}) {
  const name = useId()
  return (
    <fieldset className={cn('bg-card-2 flex rounded-full p-1', className)}>
      <legend className="sr-only">{legend}</legend>
      {options.map((o) => (
        <label
          key={String(o.value)}
          title={o.title}
          className={cn(
            'text-soft flex h-8 flex-1 cursor-pointer items-center justify-center rounded-full px-2.5 text-[13px] whitespace-nowrap transition-colors',
            'hover:text-bone has-[:focus-visible]:outline-saffron has-[:focus-visible]:outline-2',
            'has-[:checked]:bg-saffron-soft has-[:checked]:text-saffron has-[:checked]:font-semibold',
          )}
        >
          <input
            type="radio"
            name={name}
            className="sr-only"
            checked={o.value === value}
            onChange={() => onChange(o.value)}
          />
          {o.label}
        </label>
      ))}
    </fieldset>
  )
}

const LAYERS: Option<MapLayer>[] = [
  { value: 'fire', label: 'Fire', title: 'Harmonized hotspots per grid cell' },
  { value: 'anomalies', label: 'Unusual', title: 'Cells with more or less fire than usual' },
  { value: 'detections', label: 'Detections', title: 'Each satellite detection, 375 m to 1 km' },
]

const GRID: Option<ResolutionChoice>[] = [
  { value: 'auto', label: 'Auto', title: 'Finer cells as you zoom in' },
  ...RESOLUTIONS.map((r) => ({ value: r, label: `${r * 100} km`, title: `${r}° cells` })),
]

export function LayerSwitch({
  value,
  onChange,
}: {
  value: MapLayer
  onChange: (l: MapLayer) => void
}) {
  return <Segmented legend="Map shows" options={LAYERS} value={value} onChange={onChange} />
}

export function GridSwitch({
  value,
  onChange,
}: {
  value: ResolutionChoice
  onChange: (r: ResolutionChoice) => void
}) {
  return <Segmented legend="Grid cell size" options={GRID} value={value} onChange={onChange} />
}

/** Satellite imagery under the data, from NASA GIBS, for the day the map shows. */
export function ImageryPicker({
  value,
  day,
  onChange,
}: {
  value: Basemap
  day: string
  onChange: (b: Basemap) => void
}) {
  const id = useId()
  const missing = value.layer && !hasImagery(value, day)
  return (
    <div>
      <label htmlFor={id} className="text-soft mb-1.5 block text-[12px]">
        Satellite imagery
      </label>
      <select
        id={id}
        value={value.id}
        onChange={(e) => onChange(BASEMAPS.find((b) => b.id === e.target.value) ?? BASEMAPS[0])}
        className="bg-card-2 border-line hover:border-mute focus-visible:border-saffron h-11 w-full rounded-full border px-3 text-[13px] transition-colors"
      >
        {BASEMAPS.map((b) => (
          <option key={b.id} value={b.id}>
            {b.sensor ? `${b.label} · ${b.sensor}` : b.label}
          </option>
        ))}
      </select>
      {value.layer && (
        <p className="text-mute mt-1.5 text-[12px] leading-snug">
          {missing ? (
            <>
              No {value.sensor} imagery before {value.since}.
            </>
          ) : (
            <>
              {value.reads} <span className="num font-mono">{day}</span>.
            </>
          )}
        </p>
      )}
    </div>
  )
}
