import { geoEquirectangular, geoPath } from 'd3-geo'
import type { FeatureCollection, Geometry } from 'geojson'
import { useId, useMemo } from 'react'
import { feature } from 'topojson-client'
import type { GeometryCollection, Topology } from 'topojson-specification'
import land110 from 'world-atlas/land-110m.json'

const W = 360
const H = 180

const LAND = feature(
  land110 as unknown as Topology,
  (land110 as unknown as Topology).objects.land as GeometryCollection,
) as FeatureCollection<Geometry>

const projection = geoEquirectangular()
  .scale(W / (2 * Math.PI))
  .translate([W / 2, H / 2])
const LAND_PATH = geoPath(projection)(LAND) ?? ''

export interface MapDot {
  lat: number
  lon: number
  /** 0..1, drives the size and glow. */
  weight: number
  color: string
  label?: string
}

/** A small world map with glowing dots, zoomed to the dots when they are close. */
export function MiniMap({ dots, label }: { dots: MapDot[]; label: string }) {
  const id = useId().replace(/:/g, '')
  const view = useMemo(() => {
    if (dots.length === 0) return `0 0 ${W} ${H}`
    const pts = dots.map((d) => projection([d.lon, d.lat]) ?? [0, 0])
    const xs = pts.map((p) => p[0])
    const ys = pts.map((p) => p[1])
    const pad = 24
    let x0 = Math.min(...xs) - pad
    let x1 = Math.max(...xs) + pad
    let y0 = Math.min(...ys) - pad
    let y1 = Math.max(...ys) + pad
    // keep the map's 2:1 and never zoom past a region
    let w = Math.max(x1 - x0, 80, (y1 - y0) * 2)
    w = Math.min(w, W)
    const h = w / 2
    const cx = (x0 + x1) / 2
    const cy = (y0 + y1) / 2
    x0 = Math.max(0, Math.min(W - w, cx - w / 2))
    y0 = Math.max(0, Math.min(H - h, cy - h / 2))
    x1 = x0 + w
    y1 = y0 + h
    return `${x0} ${y0} ${x1 - x0} ${y1 - y0}`
  }, [dots])
  const scale = Number(view.split(' ')[2]) / W

  return (
    <svg
      viewBox={view}
      role="img"
      aria-label={label}
      className="bg-[rgb(16_13_15/0.6)] block aspect-[2/1] w-full rounded-[12px]"
    >
      <defs>
        <pattern
          id={`dots-${id}`}
          width={2.4 * scale}
          height={2.4 * scale}
          patternUnits="userSpaceOnUse"
        >
          <circle
            cx={1.2 * scale}
            cy={1.2 * scale}
            r={0.55 * scale}
            fill="rgb(242 236 228 / 0.28)"
          />
        </pattern>
        <filter id={`glow-${id}`} x="-200%" y="-200%" width="500%" height="500%">
          <feGaussianBlur stdDeviation={3 * scale} />
        </filter>
      </defs>
      <path
        d={LAND_PATH}
        fill={`url(#dots-${id})`}
        stroke="rgb(242 236 228 / 0.12)"
        strokeWidth={0.4 * scale}
      />
      {dots.map((d, i) => {
        const [x, y] = projection([d.lon, d.lat]) ?? [0, 0]
        const r = (2 + d.weight * 5) * scale
        return (
          <g key={i}>
            <circle
              cx={x}
              cy={y}
              r={r * 2.2}
              fill={d.color}
              opacity={0.55}
              filter={`url(#glow-${id})`}
            />
            <circle
              cx={x}
              cy={y}
              r={r}
              fill={d.color}
              stroke="rgb(16 13 15 / 0.8)"
              strokeWidth={0.5 * scale}
            >
              {d.label && <title>{d.label}</title>}
            </circle>
            {i < 3 && (
              <text
                x={x}
                y={y}
                dy="0.35em"
                textAnchor="middle"
                className="fill-[var(--on-accent)] font-mono font-semibold"
                style={{ fontSize: `${r * 1.1}px` }}
              >
                {i + 1}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}
