import L from 'leaflet'
import { useEffect, useMemo, useRef, useState } from 'react'
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
import { useMode } from '@/hooks/use-mode'
import { areaBounds, type Area, type Bounds } from '@/lib/area'
import { gibsUrl, hasImagery, type Basemap } from '@/lib/basemaps'
import { footprint, frpColor, type Detection } from '@/lib/detections'
import { initialDrawing, type DrawingAction, type DrawingState } from '@/lib/drawing'
import { formatCount, formatSignedPct } from '@/lib/format'
import { heatFor } from '@/lib/heat'
import { TONE_COLOR, statusMeta } from '@/lib/status'

export type MapLayer = 'fire' | 'anomalies' | 'detections' | 'none'

/** Where a map is looking, to keep two maps in step. */
export interface MapView {
  lat: number
  lon: number
  zoom: number
}

/** From this zoom on, a 375 m pixel is big enough to draw as its footprint. */
export const FOOTPRINT_ZOOM = 11

interface AreaMapProps {
  area: Area
  drawing?: DrawingState
  dispatch?: (a: DrawingAction) => void
  layer: MapLayer
  fire?: MapResponse
  anomalies?: AnomalyCell[]
  /** Individual detections, for the `detections` layer. */
  detections?: Detection[]
  /** Hotspots of the brightest cell; pass the same to two maps to compare them. */
  scaleMax?: number
  /** Satellite imagery under the data, and its day (YYYY-MM-DD). */
  basemap?: Basemap
  imageryDay?: string
  /** A tap on the map while no drawing tool is active. */
  onPick?: (lat: number, lon: number) => void
  view?: MapView
  onView?: (v: MapView) => void
  className?: string
}

const noop = () => {}

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
  onPick,
}: {
  drawing: DrawingState
  dispatch: (a: DrawingAction) => void
  onPick?: (lat: number, lon: number) => void
}) {
  const map = useMapEvents({
    click(e) {
      // Leaflet repeats the world sideways: bring the longitude back to ±180
      const { lat, lng } = e.latlng.wrap()
      if (drawing.tool) dispatch({ type: 'tap', lat, lon: lng })
      else onPick?.(lat, lng)
    },
  })
  useEffect(() => {
    map.getContainer().style.cursor = drawing.tool || onPick ? 'crosshair' : ''
  }, [map, drawing.tool, onPick])
  return null
}

/** Reports the view and follows the one it is given, so two maps move together. */
function SyncView({ view, onView }: { view?: MapView; onView?: (v: MapView) => void }) {
  // moves this component makes itself are not reported back, or two maps would chase each other
  const applying = useRef(false)
  const map = useMapEvents({
    moveend() {
      if (applying.current) return
      const c = map.getCenter()
      onView?.({ lat: c.lat, lon: c.lng, zoom: map.getZoom() })
    },
  })
  useEffect(() => {
    if (!view) return
    const c = map.getCenter()
    const same =
      Math.abs(c.lat - view.lat) < 1e-6 &&
      Math.abs(c.lng - view.lon) < 1e-6 &&
      map.getZoom() === view.zoom
    if (same) return
    applying.current = true
    map.setView([view.lat, view.lon], view.zoom, { animate: false })
    applying.current = false
  }, [map, view])
  return null
}

function useZoom(): number {
  const map = useMap()
  const [zoom, setZoom] = useState(() => map.getZoom())
  useMapEvents({ zoomend: () => setZoom(map.getZoom()) })
  return zoom
}

/** Each detection: a dot from afar, the ground its pixel covers from close. */
function Detections({ items, css }: { items: Detection[]; css: (v: string) => string }) {
  const zoom = useZoom()
  const renderer = useMemo(() => L.canvas({ padding: 0.3 }), [])
  return items.map((d, i) => {
    const color = css(frpColor(d.frp))
    const tip = (
      <Tooltip>
        {d.date} {d.time.slice(0, 2)}:{d.time.slice(2)} UTC · {d.satellite} ·{' '}
        {d.pass === 'D' ? 'day pass' : d.pass === 'N' ? 'night pass' : 'pass unknown'}
        <br />
        {d.frp !== null ? `${formatCount(d.frp)} MW` : 'no FRP'} · confidence {d.confidence}
        {d.scanKm !== null && d.trackKm !== null && (
          <>
            {' '}
            · pixel {Math.round(d.scanKm * 1000)} × {Math.round(d.trackKm * 1000)} m
          </>
        )}
        {d.provisional && ' · provisional'}
      </Tooltip>
    )
    return zoom >= FOOTPRINT_ZOOM ? (
      <Rectangle
        key={i}
        bounds={footprint(d)}
        renderer={renderer}
        pathOptions={{ color, weight: 1, fillColor: color, fillOpacity: 0.55 }}
      >
        {tip}
      </Rectangle>
    ) : (
      <CircleMarker
        key={i}
        center={[d.lat, d.lon]}
        radius={3}
        renderer={renderer}
        pathOptions={{ stroke: false, fillColor: color, fillOpacity: 0.9 }}
      >
        {tip}
      </CircleMarker>
    )
  })
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

/** The map: the chosen area, the drawing in progress and a fire layer. */
export function AreaMap({
  area,
  drawing = initialDrawing,
  dispatch = noop,
  layer,
  fire,
  anomalies,
  detections,
  scaleMax,
  basemap,
  imageryDay,
  onPick,
  view,
  onView,
  className,
}: AreaMapProps) {
  const renderer = useMemo(() => L.canvas({ padding: 0.3 }), [])
  const [mode] = useMode()
  // CSS variables do not reach the canvas: resolve them.
  const style = getComputedStyle(document.documentElement)
  const css = (v: string) =>
    v.startsWith('var(') ? style.getPropertyValue(v.slice(4, -1)).trim() || '#f0933a' : v
  const imagery = basemap && imageryDay && hasImagery(basemap, imageryDay) ? basemap : null
  const max = Math.max(scaleMax ?? fire?.max_hotspots ?? 1, 1)

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
      {/* the key makes Leaflet swap the tiles when the mode changes */}
      <TileLayer
        key={mode}
        url={mode === 'day' ? TILES.light : TILES.dark}
        attribution={TILE_ATTRIBUTION}
        maxZoom={16}
      />
      {imagery && (
        <TileLayer
          key={`${imagery.id}-${imageryDay}`}
          url={gibsUrl(imagery, imageryDay!)}
          attribution="Imagery: NASA GIBS / ESDIS"
          maxNativeZoom={imagery.level}
          maxZoom={16}
        />
      )}
      {!view && <FitArea area={area} />}
      <Taps drawing={drawing} dispatch={dispatch} onPick={onPick} />
      {(view || onView) && <SyncView view={view} onView={onView} />}

      {layer === 'fire' &&
        fire?.cells.map(([lat, lon, h]) => (
          <CircleMarker
            key={`${lat},${lon}`}
            center={[lat, lon]}
            radius={2 + 7 * Math.min(1, Math.sqrt(h / max))}
            renderer={renderer}
            pathOptions={{
              stroke: false,
              fillColor: css(heatFor(h, max)),
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

      {layer === 'detections' && detections && <Detections items={detections} css={css} />}

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
