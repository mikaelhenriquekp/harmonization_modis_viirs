import L from 'leaflet'
import { useEffect, useMemo } from 'react'
import {
  Circle,
  CircleMarker,
  MapContainer,
  Polygon,
  Polyline,
  Rectangle,
  TileLayer,
  Tooltip,
  useMap,
  useMapEvents,
} from 'react-leaflet'

import type { AnomalyCell, MapResponse } from '@/api/types'
import { areaBounds, type Area, type Bounds } from '@/lib/area'
import type { DrawingAction, DrawingState } from '@/lib/drawing'
import { formatCount, formatSignedPct } from '@/lib/format'
import { TONE_COLOR, statusMeta } from '@/lib/status'

export type MapLayer = 'fire' | 'anomalies' | 'none'

interface AreaMapProps {
  area: Area
  drawing: DrawingState
  dispatch: (a: DrawingAction) => void
  layer: MapLayer
  fire?: MapResponse
  anomalies?: AnomalyCell[]
  className?: string
}

// Esri Canvas basemaps: muted, so the fire stands out, and usable without a key.
const TILES = {
  dark: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
  light:
    'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}',
}
const TILE_ATTRIBUTION =
  'Tiles &copy; Esri, HERE, Garmin, &copy; OpenStreetMap contributors · Hotspots: NASA FIRMS'

const AREA_STYLE = { color: '#f0c048', weight: 2, fillColor: '#f0c048', fillOpacity: 0.08 }

function FitArea({ area }: { area: Area }) {
  const map = useMap()
  // fly only when the area's extent changes, not on every render
  const bounds = JSON.stringify(areaBounds(area))
  useEffect(() => {
    const b = JSON.parse(bounds) as Bounds | null
    if (b) map.flyToBounds(b, { padding: [24, 24], duration: 0.6, maxZoom: 9 })
    else map.flyTo([20, 0], 2, { duration: 0.6 })
  }, [map, bounds])
  return null
}

function Taps({
  drawing,
  dispatch,
}: {
  drawing: DrawingState
  dispatch: (a: DrawingAction) => void
}) {
  const map = useMapEvents({
    click(e) {
      dispatch({ type: 'tap', lat: e.latlng.lat, lon: e.latlng.lng })
    },
  })
  useEffect(() => {
    map.getContainer().style.cursor = drawing.tool ? 'crosshair' : ''
  }, [map, drawing.tool])
  return null
}

function AreaShape({ area }: { area: Area }) {
  switch (area.kind) {
    case 'bbox':
      return (
        <Rectangle
          bounds={[
            [area.south, area.west],
            [area.north, area.east],
          ]}
          pathOptions={AREA_STYLE}
        />
      )
    case 'point':
      return (
        <Circle
          center={[area.lat, area.lon]}
          radius={area.radiusKm * 1000}
          pathOptions={AREA_STYLE}
        />
      )
    case 'polygon':
      return (
        <Polygon
          positions={area.points.map(([lon, lat]) => [lat, lon] as [number, number])}
          pathOptions={AREA_STYLE}
        />
      )
    case 'world':
      return null
  }
}

function heatFor(v: number, max: number): string {
  const step = Math.min(7, Math.max(1, Math.ceil((Math.sqrt(v / max) || 0) * 7)))
  return `var(--heat-${step})`
}

/** The map: the chosen area, the drawing in progress and a fire layer. */
export function AreaMap({
  area,
  drawing,
  dispatch,
  layer,
  fire,
  anomalies,
  className,
}: AreaMapProps) {
  const renderer = useMemo(() => L.canvas({ padding: 0.3 }), [])
  // CSS variables do not reach the canvas: resolve them.
  const style = getComputedStyle(document.documentElement)
  const css = (v: string) =>
    v.startsWith('var(') ? style.getPropertyValue(v.slice(4, -1)).trim() || '#f0933a' : v

  return (
    <MapContainer
      center={[38, -1.5]}
      zoom={6}
      minZoom={2}
      worldCopyJump
      className={className}
      attributionControl
      preferCanvas
    >
      <TileLayer url={TILES.dark} attribution={TILE_ATTRIBUTION} maxZoom={16} />
      <FitArea area={area} />
      <Taps drawing={drawing} dispatch={dispatch} />

      {layer === 'fire' &&
        fire?.cells.map(([lat, lon, h]) => (
          <CircleMarker
            key={`${lat},${lon}`}
            center={[lat, lon]}
            radius={2 + 7 * Math.sqrt(h / Math.max(fire.max_hotspots, 1))}
            renderer={renderer}
            pathOptions={{
              stroke: false,
              fillColor: css(heatFor(h, fire.max_hotspots)),
              fillOpacity: 0.85,
            }}
            interactive={false}
          />
        ))}
      {layer === 'anomalies' &&
        anomalies
          ?.filter((c) => c.status !== 'normal')
          .map((c) => (
            <CircleMarker
              key={`${c.lat},${c.lon}`}
              center={[c.lat, c.lon]}
              radius={c.status === 'much_above' || c.status === 'much_below' ? 6 : 4}
              renderer={renderer}
              pathOptions={{
                stroke: false,
                fillColor: css(TONE_COLOR[statusMeta(c.status).tone]),
                fillOpacity: 0.85,
              }}
            >
              <Tooltip>
                {statusMeta(c.status).label}: {formatCount(c.projected)} hotspots
                {c.anomaly_pct !== null && ` (${formatSignedPct(c.anomaly_pct)} vs usual)`}
              </Tooltip>
            </CircleMarker>
          ))}

      {!drawing.tool && <AreaShape area={area} />}
      {drawing.points.length > 0 && (
        <>
          <Polyline positions={drawing.points} pathOptions={{ ...AREA_STYLE, dashArray: '6 6' }} />
          {drawing.points.map((p, i) => (
            <CircleMarker
              key={i}
              center={p}
              radius={i === 0 ? 7 : 5}
              pathOptions={{ color: '#f0c048', fillColor: '#100d0f', fillOpacity: 1, weight: 2 }}
              eventHandlers={
                i === 0
                  ? {
                      click: (e) => {
                        L.DomEvent.stopPropagation(e)
                        dispatch({ type: 'closeOnFirst' })
                      },
                    }
                  : undefined
              }
            />
          ))}
        </>
      )}
    </MapContainer>
  )
}
