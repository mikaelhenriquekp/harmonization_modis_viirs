import { Crosshair, Flame, Glasses, Grid3x3, ScanSearch, Waves } from 'lucide-react'
import { useId, useState, type ReactNode } from 'react'

import type { Resolution } from '@/api/firemap'
import type { MapLayer } from '@/components/explore/area-map'
import { BASEMAPS, FIRE_BANDS, hasImagery, type Basemap } from '@/lib/basemaps'
import { cn } from '@/lib/utils'

export function PanelSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-line border-b py-4 first:pt-0 last:border-b-0 last:pb-0">
      <h3 className="eyebrow mb-2.5">{title}</h3>
      {children}
    </section>
  )
}

const LAYERS: { id: MapLayer; label: string; hint: string; icon: ReactNode }[] = [
  {
    id: 'fire',
    label: 'Fire activity',
    hint: 'Harmonized hotspots per cell',
    icon: <Flame className="size-4" />,
  },
  {
    id: 'anomalies',
    label: 'Anomalies',
    hint: 'This month against its history',
    icon: <Waves className="size-4" />,
  },
  {
    id: 'detections',
    label: 'Detections, 375 m',
    hint: 'Every satellite detection',
    icon: <ScanSearch className="size-4" />,
  },
]

export function LayerPicker({
  value,
  onChange,
  detailAvailable,
}: {
  value: MapLayer
  onChange: (l: MapLayer) => void
  /** The detail layer needs a place smaller than the whole world. */
  detailAvailable: boolean
}) {
  const name = useId()
  return (
    <fieldset className="space-y-1.5">
      <legend className="sr-only">Map layer</legend>
      {LAYERS.map((l) => {
        const disabled = l.id === 'detections' && !detailAvailable
        return (
          <label
            key={l.id}
            className={cn(
              'border-line has-[:checked]:border-saffron has-[:checked]:bg-saffron-soft flex cursor-pointer items-center gap-2.5 rounded-[10px] border px-3 py-2 has-[:focus-visible]:outline-2',
              disabled && 'cursor-not-allowed opacity-40',
            )}
          >
            <input
              type="radio"
              name={name}
              className="sr-only"
              checked={value === l.id}
              disabled={disabled}
              onChange={() => onChange(l.id)}
            />
            <span className="text-saffron">{l.icon}</span>
            <span className="min-w-0">
              <span className="block text-[13px] font-semibold">{l.label}</span>
              <span className="text-mute block truncate text-[11px]">
                {disabled ? 'Pick a place first' : l.hint}
              </span>
            </span>
          </label>
        )
      })}
    </fieldset>
  )
}

const RESOLUTIONS: Resolution[] = [0.25, 0.5, 1, 2]

export function ResolutionPicker({
  value,
  onChange,
  min,
}: {
  value: Resolution
  onChange: (r: Resolution) => void
  /** The finest cell allowed for the area on screen. */
  min: Resolution
}) {
  return (
    <div className="flex items-center gap-2">
      <Grid3x3 className="text-soft size-4 shrink-0" aria-hidden />
      <div role="group" aria-label="Cell size" className="flex flex-1 gap-1">
        {RESOLUTIONS.map((r) => (
          <button
            key={r}
            type="button"
            aria-pressed={r === value}
            disabled={r < min}
            onClick={() => onChange(r)}
            className={cn(
              'border-line h-8 flex-1 rounded-full border font-mono text-[12px] disabled:opacity-35',
              r === value ? 'border-saffron bg-saffron-soft text-saffron' : 'hover:bg-white/5',
            )}
          >
            {r}°
          </button>
        ))}
      </div>
    </div>
  )
}

const inLat = (v: number) => Number.isFinite(v) && v >= -90 && v <= 90
const inLon = (v: number) => Number.isFinite(v) && v >= -180 && v <= 180

/** Type a latitude and longitude instead of tapping the map. */
export function CoordsForm({
  radiusKm,
  onRadius,
  onGo,
}: {
  radiusKm: number
  onRadius: (km: number) => void
  onGo: (lat: number, lon: number) => void
}) {
  const id = useId()
  const [lat, setLat] = useState('')
  const [lon, setLon] = useState('')
  const la = Number(lat)
  const lo = Number(lon)
  const ok = lat !== '' && lon !== '' && inLat(la) && inLon(lo)
  const field =
    'bg-card-2 border-line w-full rounded-md border px-2 py-1.5 font-mono text-[12px] placeholder:text-mute'
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault()
        if (ok) onGo(la, lo)
      }}
    >
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label htmlFor={`${id}-lat`} className="text-soft text-[11px]">
            Latitude
          </label>
          <input
            id={`${id}-lat`}
            inputMode="decimal"
            placeholder="37.99"
            value={lat}
            onChange={(e) => setLat(e.target.value)}
            className={field}
          />
        </div>
        <div>
          <label htmlFor={`${id}-lon`} className="text-soft text-[11px]">
            Longitude
          </label>
          <input
            id={`${id}-lon`}
            inputMode="decimal"
            placeholder="-1.13"
            value={lon}
            onChange={(e) => setLon(e.target.value)}
            className={field}
          />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <label htmlFor={`${id}-radius`} className="text-soft text-[11px]">
          Radius
        </label>
        <select
          id={`${id}-radius`}
          value={radiusKm}
          onChange={(e) => onRadius(Number(e.target.value))}
          className="bg-card-2 border-line rounded-md border px-2 py-1.5 text-[12px]"
        >
          {[5, 10, 25, 50, 100].map((r) => (
            <option key={r} value={r}>
              {r} km
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={!ok}
          className="bg-saffron ml-auto flex h-8 items-center gap-1.5 rounded-full px-3 text-[12px] font-semibold text-[#100d0f] disabled:opacity-40"
        >
          <Crosshair className="size-3.5" /> Go
        </button>
      </div>
      {(lat !== '' || lon !== '') && !ok && (
        <p className="text-garnet text-[11px]">
          Latitude from −90 to 90, longitude from −180 to 180, in decimal degrees.
        </p>
      )}
    </form>
  )
}

/** "Spectral vision": look at the surface through each sensor. */
export function SpectralPicker({
  value,
  onChange,
  day,
  onDay,
  maxDay,
}: {
  value: Basemap
  onChange: (b: Basemap) => void
  day: string
  onDay: (d: string) => void
  maxDay?: string
}) {
  const id = useId()
  const missing = value.layer !== null && !hasImagery(value, day)
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Glasses className="text-saffron size-4 shrink-0" aria-hidden />
        <label htmlFor={`${id}-map`} className="sr-only">
          Satellite view
        </label>
        <select
          id={`${id}-map`}
          value={value.id}
          onChange={(e) => onChange(BASEMAPS.find((b) => b.id === e.target.value) ?? BASEMAPS[0])}
          className="bg-card-2 border-line min-w-0 flex-1 rounded-md border px-2 py-1.5 text-[12px]"
        >
          {BASEMAPS.map((b) => (
            <option key={b.id} value={b.id}>
              {b.sensor ? `${b.sensor}: ${b.label}` : b.label}
            </option>
          ))}
        </select>
      </div>
      {value.layer && (
        <div className="flex items-center gap-2">
          <label htmlFor={`${id}-day`} className="text-soft text-[11px]">
            Image of
          </label>
          <input
            id={`${id}-day`}
            type="date"
            value={day}
            min={value.since ?? undefined}
            max={maxDay}
            onChange={(e) => e.target.value && onDay(e.target.value)}
            className="bg-card-2 border-line rounded-md border px-2 py-1 font-mono text-[12px]"
          />
        </div>
      )}
      <p className="text-soft text-[11px] leading-relaxed">{value.reads}</p>
      {missing && (
        <p className="text-garnet text-[11px]">
          {value.sensor} imagery starts on {value.since}. Pick a later day or another sensor.
        </p>
      )}
      <details className="text-[11px]">
        <summary className="text-saffron cursor-pointer">How each sensor sees fire</summary>
        <ul className="text-soft mt-1.5 space-y-1 leading-relaxed">
          {FIRE_BANDS.map((b) => (
            <li key={b.sensor}>
              <strong className="text-bone">{b.sensor}</strong>, {b.pixel} pixels: {b.bands}.
            </li>
          ))}
          <li>
            Both compare a mid-infrared band, where flames shine, with a thermal band that gives the
            background. Smaller pixels catch smaller fires, which is why the two counts need
            harmonizing.
          </li>
          <li>These images show the surface; the detections come from the layers above.</li>
        </ul>
      </details>
    </div>
  )
}
