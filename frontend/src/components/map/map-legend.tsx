import type { MapLayer } from '@/components/explore/area-map'
import { FRP_CLASSES } from '@/lib/detections'
import { formatCount } from '@/lib/format'
import { MAP_STEPS, mapBreaks } from '@/lib/heat'
import { STATUS_ORDER, statusMeta, TONE_COLOR } from '@/lib/status'
import { cn } from '@/lib/utils'

function Swatch({ color }: { color: string }) {
  return (
    <span
      aria-hidden
      className="inline-block size-2.5 shrink-0 rounded-[3px]"
      style={{ background: color }}
    />
  )
}

interface MapLegendProps {
  layer: MapLayer
  /** What the layer shows, e.g. "August 2017". */
  period?: string
  /** Hotspots of the brightest cell on the map. */
  max?: number
  cellDegrees?: number
  /** Number of detections drawn, for the detections layer. */
  count?: number
  className?: string
}

const ANOMALY_KEYS = STATUS_ORDER.filter((s) => s !== 'normal' && s !== 'no_history')

/** Says what every colour on the map stands for. */
export function MapLegend({ layer, period, max, cellDegrees, count, className }: MapLegendProps) {
  if (layer === 'none') return null
  return (
    <figure aria-label="Map legend" className={cn('text-[12px] leading-snug', className)}>
      {layer === 'fire' && (
        <>
          <figcaption className="text-soft">
            Hotspots per {cellDegrees ? `${cellDegrees}°` : ''} cell
            {period && <span className="text-mute"> · {period}</span>}
          </figcaption>
          <div className="mt-2 flex h-2.5 overflow-hidden rounded-full" aria-hidden>
            {MAP_STEPS.map((s) => (
              <span key={s} className="flex-1" style={{ background: `var(--heat-${s})` }} />
            ))}
          </div>
          <div className="text-mute num mt-1 flex justify-between font-mono text-[11px]">
            {max !== undefined ? (
              <>
                <span>{formatCount(Math.max(mapBreaks(max)[1], 1))}</span>
                <span>{formatCount(mapBreaks(max)[3])}</span>
                <span>{formatCount(max)}</span>
              </>
            ) : (
              <>
                <span>fewer</span>
                <span>more</span>
              </>
            )}
          </div>
        </>
      )}
      {layer === 'anomalies' && (
        <>
          <figcaption className="text-soft">
            This month against the same month of past years
            {period && <span className="text-mute"> · {period}</span>}
          </figcaption>
          <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
            {ANOMALY_KEYS.map((s) => (
              <li key={s} className="flex items-center gap-2">
                <Swatch color={TONE_COLOR[statusMeta(s).tone]} />
                {statusMeta(s).label}
              </li>
            ))}
          </ul>
        </>
      )}
      {layer === 'detections' && (
        <>
          <figcaption className="text-soft">
            {count !== undefined ? `${formatCount(count)} detections` : 'Detections'} by radiative
            power
            {period && <span className="text-mute"> · {period}</span>}
          </figcaption>
          <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
            {FRP_CLASSES.map((c) => (
              <li key={c.label} className="flex items-center gap-2">
                <Swatch color={c.color} />
                {c.label}
              </li>
            ))}
          </ul>
        </>
      )}
    </figure>
  )
}
