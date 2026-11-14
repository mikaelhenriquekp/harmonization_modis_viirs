import type { MapLayer } from './area-map'

const OPTIONS: { value: MapLayer; label: string }[] = [
  { value: 'fire', label: 'Fire this month' },
  { value: 'anomalies', label: 'Unusual fire' },
  { value: 'none', label: 'Area only' },
]

/** What the map shows behind the area. */
export function LayerToggle({
  value,
  onChange,
}: {
  value: MapLayer
  onChange: (v: MapLayer) => void
}) {
  return (
    <fieldset className="flex flex-wrap gap-1.5 text-xs">
      <legend className="sr-only">Map layer</legend>
      {OPTIONS.map((o) => (
        <label
          key={o.value}
          className="border-line has-[:checked]:bg-surface-2 has-[:checked]:text-foreground text-muted-foreground cursor-pointer rounded-full border px-2.5 py-1 has-[:focus-visible]:outline-2"
        >
          <input
            type="radio"
            name="map-layer"
            className="sr-only"
            checked={value === o.value}
            onChange={() => onChange(o.value)}
          />
          {o.label}
        </label>
      ))}
    </fieldset>
  )
}
