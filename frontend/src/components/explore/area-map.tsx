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
  useMap,
  useMapEvents,
} from 'react-leaflet'

import type { AnomalyCell, MapResponse } from '@/api/types'
import { areaBounds, type Area, type Bounds } from '@/lib/area'
import { gibsUrl, hasImagery, type Basemap } from '@/lib/basemaps'
import { footprint, frpColor, type Detection } from '@/lib/detections'
import { initialDrawing, type DrawingAction, type DrawingState } from '@/lib/drawing'
import { formatCount, formatSignedPct } from '@/lib/format'
import { mapStep } from '@/lib/heat'
import { TONE_COLOR, statusMeta } from '@/lib/status'
import type { Viewport } from '@/lib/viewport'

export type MapLayer = 'fire' | 'anomalies' | 'detections' | 'none'

/** Where a map is looking, to keep two maps in step. */
export interface MapView {
  lat: number
  lon: number
  zoom: number
}

/** Room taken by panels floating over the map, in pixels, so fitting keeps the area clear. */
export interface MapInset {
  top?: number
  right?: number
  bottom?: number
  left?: number
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
  /** The anomaly grid's cell size in degrees. */
  anomalyResolution?: number
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
  /** Reports what the map shows after every move. */
  onViewport?: (v: Viewport) => void
  /** The area to fly to when it changes; defaults to `area`, null never flies. */
  fitTo?: Area | null
  inset?: MapInset
  /** Where Leaflet's zoom buttons go; false hides them. */
  zoomControl?: L.ControlPosition | false
  className?: string
}

const noop = () => {}

// Esri Canvas: a muted basemap, so the fire stands out, usable without a key.
const TILES =
  'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}'
const TILE_ATTRIBUTION =
  'Tiles &copy; Esri, HERE, Garmin, &copy; OpenStreetMap contributors · Hotspots: NASA FIRMS'

const AREA_STYLE = {
  color: '#f0c048',
  weight: 2,
  fillColor: '#f0c048',
  fillOpacity: 0.04,
  interactive: false,
}

/** The inhabited world, so the first view is not mostly polar ice. */
const WORLD_BOUNDS: Bounds = [
  [-50, -165],
  [72, 180],
]

const cssCache = new Map<string, string>()

/** CSS variables do not reach the canvas: resolve them, once per value. */
function css(v: string): string {
  if (!v.startsWith('var(')) return v
  let c = cssCache.get(v)
  if (!c) {
    c =
      getComputedStyle(document.documentElement).getPropertyValue(v.slice(4, -1)).trim() ||
      '#ee8f5a'
    cssCache.set(v, c)
  }
  return c
}

function fitOptions(inset: MapInset | undefined): L.FitBoundsOptions {
  const i = { top: 0, right: 0, bottom: 0, left: 0, ...inset }
  return {
    paddingTopLeft: [i.left + 24, i.top + 24],
    paddingBottomRight: [i.right + 24, i.bottom + 24],
  }
}

function FitArea({ area, inset }: { area: Area; inset?: MapInset }) {
  const map = useMap()
  // fly only when the area's extent changes, not on every render
  const bounds = JSON.stringify(areaBounds(area) ?? WORLD_BOUNDS)
  const world = area.kind === 'world'
  const pad = JSON.stringify(inset ?? {})
  const first = useRef(true)
  useEffect(() => {
    const b = JSON.parse(bounds) as Bounds
    const opts = { ...fitOptions(JSON.parse(pad) as MapInset), maxZoom: 9 }
    if (first.current) {
      first.current = false
      map.fitBounds(b, { ...opts, animate: false })
      if (world) map.setZoom(Math.max(map.getZoom(), 2), { animate: false })
    } else {
      map.flyToBounds(b, { ...opts, duration: 0.6 })
    }
  }, [map, bounds, pad, world])
  return null
}

function ReportViewport({ onViewport }: { onViewport: (v: Viewport) => void }) {
  const map = useMapEvents({ moveend: () => report() })
  const report = () => {
    const b = map.getBounds()
    onViewport({
      west: b.getWest(),
      south: b.getSouth(),
      east: b.getEast(),
      north: b.getNorth(),
      zoom: map.getZoom(),
    })
  }
  // the first view, once the map has its size
  useEffect(() => {
    map.whenReady(report)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map])
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

function ZoomButtons({ position }: { position: L.ControlPosition }) {
  const map = useMap()
  useEffect(() => {
    const c = L.control.zoom({ position })
    c.addTo(map)
    return () => {
      c.remove()
    }
  }, [map, position])
  return null
}

/**
 * A layer of many shapes, drawn imperatively on one canvas: thousands of
 * React-Leaflet components would be slow to mount and to update.
 */
function useCanvasLayer(build: (renderer: L.Canvas) => L.Layer[], deps: unknown[]) {
  const map = useMap()
  const renderer = useMemo(() => L.canvas({ padding: 0.4, tolerance: 2 }), [])
  useEffect(() => {
    const group = L.layerGroup(build(renderer)).addTo(map)
    return () => {
      group.remove()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, renderer, ...deps])
}

function cellBounds(lat: number, lon: number, size: number): L.LatLngBoundsExpression {
  const h = size / 2
  return [
    [lat - h, lon - h],
    [lat + h, lon + h],
  ]
}

function FireCells({ fire, max }: { fire: MapResponse; max: number }) {
  useCanvasLayer(
    (renderer) =>
      fire.cells.map(([lat, lon, h, frp]) => {
        const step = mapStep(h, max)
        return L.rectangle(cellBounds(lat, lon, fire.resolution), {
          renderer,
          stroke: false,
          fillColor: css(`var(--heat-${step})`),
          fillOpacity: 0.45 + step * 0.08,
        }).bindTooltip(
          `<b>${formatCount(h)}</b> hotspots${frp ? ` · ${formatCount(frp)} MW total power` : ''}`,
          { sticky: true, direction: 'top', className: 'map-tip' },
        )
      }),
    [fire, max],
  )
  return null
}

function AnomalyCells({ cells, size }: { cells: AnomalyCell[]; size: number }) {
  useCanvasLayer(
    (renderer) =>
      cells
        .filter((c) => c.status !== 'normal' && c.status !== 'no_history')
        .map((c) => {
          const meta = statusMeta(c.status)
          const strong = c.status === 'much_above' || c.status === 'much_below'
          return L.rectangle(cellBounds(c.lat, c.lon, size), {
            renderer,
            stroke: false,
            fillColor: css(TONE_COLOR[meta.tone]),
            fillOpacity: strong ? 0.85 : 0.6,
          }).bindTooltip(
            `<b>${meta.label}</b><br>${formatCount(c.projected)} hotspots expected, usually ${formatCount(c.median ?? 0)}${
              c.anomaly_pct !== null ? ` (${formatSignedPct(c.anomaly_pct)})` : ''
            }`,
            { sticky: true, direction: 'top', className: 'map-tip' },
          )
        }),
    [cells, size],
  )
  return null
}

function detectionTip(d: Detection): string {
  const pass = d.pass === 'D' ? 'day pass' : d.pass === 'N' ? 'night pass' : 'pass unknown'
  const pixel =
    d.scanKm !== null && d.trackKm !== null
      ? ` · pixel ${Math.round(d.scanKm * 1000)} × ${Math.round(d.trackKm * 1000)} m`
      : ''
  return (
    `<b>${d.frp !== null ? `${formatCount(d.frp)} MW` : 'No power reading'}</b> · ${d.satellite}<br>` +
    `${d.date} ${d.time.slice(0, 2)}:${d.time.slice(2)} UTC · ${pass}${pixel}` +
    (d.provisional ? ' · provisional' : '')
  )
}

/** Each detection: a dot from afar, the ground its pixel covers from close. */
function Detections({ items }: { items: Detection[] }) {
  const map = useMap()
  const [close, setClose] = useState(() => map.getZoom() >= FOOTPRINT_ZOOM)
  useMapEvents({ zoomend: () => setClose(map.getZoom() >= FOOTPRINT_ZOOM) })
  useCanvasLayer(
    (renderer) =>
      items.map((d) => {
        const color = css(frpColor(d.frp))
        const shape = close
          ? L.rectangle(footprint(d), {
              renderer,
              color,
              weight: 1,
              fillColor: color,
              fillOpacity: 0.55,
            })
          : L.circleMarker([d.lat, d.lon], {
              renderer,
              radius: 3,
              stroke: false,
              fillColor: color,
              fillOpacity: 0.9,
            })
        return shape.bindTooltip(detectionTip(d), {
          sticky: true,
          direction: 'top',
          className: 'map-tip',
        })
      }),
    [items, close],
  )
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
        <>
          <Circle
            center={[area.lat, area.lon]}
            radius={area.radiusKm * 1000}
            pathOptions={AREA_STYLE}
          />
          <CircleMarker
            center={[area.lat, area.lon]}
            radius={4}
            pathOptions={{ ...AREA_STYLE, fillColor: '#f0c048', fillOpacity: 1, weight: 0 }}
          />
        </>
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

/** The map: the chosen area, the drawing in progress and a data layer. */
export function AreaMap({
  area,
  drawing = initialDrawing,
  dispatch = noop,
  layer,
  fire,
  anomalies,
  anomalyResolution = 1,
  detections,
  scaleMax,
  basemap,
  imageryDay,
  onPick,
  view,
  onView,
  onViewport,
  fitTo,
  inset,
  zoomControl = 'topleft',
  className,
}: AreaMapProps) {
  const imagery = basemap && imageryDay && hasImagery(basemap, imageryDay) ? basemap : null
  const max = Math.max(scaleMax ?? fire?.max_hotspots ?? 1, 1)

  return (
    <MapContainer
      center={[20, 0]}
      zoom={2}
      minZoom={2}
      worldCopyJump
      zoomControl={false}
      className={className}
      attributionControl
      preferCanvas
    >
      <TileLayer url={TILES} attribution={TILE_ATTRIBUTION} maxZoom={16} />
      {imagery && (
        <TileLayer
          key={`${imagery.id}-${imageryDay}`}
          url={gibsUrl(imagery, imageryDay!)}
          attribution="Imagery: NASA GIBS / ESDIS"
          maxNativeZoom={imagery.level}
          maxZoom={16}
          opacity={0.92}
        />
      )}
      {zoomControl && <ZoomButtons position={zoomControl} />}
      {!view && fitTo !== null && <FitArea area={fitTo ?? area} inset={inset} />}
      {onViewport && <ReportViewport onViewport={onViewport} />}
      <Taps drawing={drawing} dispatch={dispatch} onPick={onPick} />
      {(view || onView) && <SyncView view={view} onView={onView} />}

      {layer === 'fire' && fire && <FireCells fire={fire} max={max} />}
      {layer === 'anomalies' && anomalies && (
        <AnomalyCells cells={anomalies} size={anomalyResolution} />
      )}
      {layer === 'detections' && detections && <Detections items={detections} />}

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
