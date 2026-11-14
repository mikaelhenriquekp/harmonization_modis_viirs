import { Flame } from 'lucide-react'

import type { MapLayer } from '@/components/explore/area-map'
import { FRP_CLASSES } from '@/lib/detections'
import { formatCount } from '@/lib/format'
import { STATUS_ORDER, statusMeta, TONE_COLOR } from '@/lib/status'
import { cn } from '@/lib/utils'

function Swatch({ color, round }: { color: string; round?: boolean }) {
  return (
    <span
      aria-hidden
      className={cn('inline-block size-3 shrink-0', round ? 'rounded-full' : 'rounded-[3px]')}
      style={{ background: color }}
    />
  )
}

interface MapLegendProps {
  layer: MapLayer
  /** What the fire layer counts, e.g. "August 2017". */
  period?: string
  /** Hotspots of the brightest cell on the map. */
  max?: number
  cellDegrees?: number
  className?: string
}

/** Says what every colour and shape on the map stands for. */
export function MapLegend({ layer, period, max, cellDegrees, className }: MapLegendProps) {
  if (layer === 'none') return null
  return (
    <div
      aria-label="Map legend"
      className={cn(
        'bg-card/95 border-line max-w-[260px] rounded-[12px] border p-3 text-[11px] leading-snug backdrop-blur',
        className,
      )}
    >
      {layer === 'fire' && (
        <>
          <p className="font-semibold">
            Harmonized hotspots{cellDegrees ? ` per ${cellDegrees}° cell` : ''}
          </p>
          {period && <p className="text-mute">{period}</p>}
          <div className="mt-2 flex items-center gap-1">
            <span className="text-mute font-mono">1</span>
            {[1, 2, 3, 4, 5, 6].map((s) => (
              <span
                key={s}
                aria-hidden
                className="h-2.5 flex-1 rounded-[2px]"
                style={{ background: `var(--heat-${s})` }}
              />
            ))}
            <span className="text-mute font-mono">{max ? formatCount(max) : 'most'}</span>
          </div>
          <p className="text-mute mt-1.5">
            Stronger colour and bigger circle mean more hotspots. A hotspot is one satellite
            detection, not one fire.
          </p>
        </>
      )}
      {layer === 'anomalies' && (
        <>
          <p className="font-semibold">This month against its own history</p>
          <ul className="mt-2 space-y-1">
            {STATUS_ORDER.filter((s) => s !== 'normal' && s !== 'no_history').map((s) => (
              <li key={s} className="flex items-center gap-2">
                <Swatch color={TONE_COLOR[statusMeta(s).tone]} round />
                {statusMeta(s).label}
              </li>
            ))}
          </ul>
          <p className="text-mute mt-1.5">Cells within their normal range are not drawn.</p>
        </>
      )}
      {layer === 'detections' && (
        <>
          <p className="font-semibold">Each detection, by radiative power</p>
          {period && <p className="text-mute">{period}</p>}
          <ul className="mt-2 space-y-1">
            {FRP_CLASSES.map((c) => (
              <li key={c.label} className="flex items-center gap-2">
                <Swatch color={c.color} />
                {c.label}
              </li>
            ))}
            <li className="flex items-center gap-2">
              <Swatch color="var(--slate)" />
              no power reported
            </li>
          </ul>
          <p className="text-mute mt-1.5">
            Zoom in and each one becomes the ground its pixel covers: about 375 m for VIIRS, 1 km
            for MODIS, wider towards the edge of the swath.
          </p>
        </>
      )}
    </div>
  )
}

/** The legend of the globe: its dots, its pins and the chosen point. */
export function GlobeLegend({
  colors,
  month,
  className,
}: {
  colors: string[]
  month?: string
  className?: string
}) {
  return (
    <ul
      aria-label="Globe legend"
      className={cn(
        'text-soft flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[12px]',
        className,
      )}
    >
      <li className="flex items-center gap-2">
        <span className="flex items-center gap-0.5" aria-hidden>
          {colors.map((c, i) => (
            <span
              key={c}
              className="rounded-full"
              style={{ background: c, width: 5 + i * 2.5, height: 5 + i * 2.5 }}
            />
          ))}
        </span>
        Hotspots per 1° cell{month ? `, ${month}` : ''}: fewer to more
      </li>
      <li className="flex items-center gap-2">
        <span
          aria-hidden
          className="grid size-5 place-items-center rounded-[6px]"
          style={{ background: 'var(--coral)' }}
        >
          <Flame className="size-3 text-[#100d0f]" fill="currentColor" />
        </span>
        Far above normal for this month (the four biggest)
      </li>
      <li className="flex items-center gap-2">
        <span aria-hidden className="bg-saffron size-3 rounded-full border-2 border-[#100d0f]" />
        The point you chose
      </li>
    </ul>
  )
}
