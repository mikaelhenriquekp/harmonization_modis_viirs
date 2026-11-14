import { geoContains } from 'd3-geo'
import type { Feature, MultiPolygon, Polygon, Position } from 'geojson'
import { feature } from 'topojson-client'
import type { GeometryCollection, Topology } from 'topojson-specification'

import type { Area } from './area'

export type CountryFeature = Feature<Polygon | MultiPolygon, { name: string }>

export interface Country {
  name: string
  /** The landmass under the point, as a polygon the API accepts; null when it cannot be drawn. */
  outline: Area | null
}

/** The API takes polygons of up to 200 corners. */
const MAX_CORNERS = 160

/** Keeps at most `max` corners of a ring, evenly spaced, without the closing point. */
export function decimate(ring: Position[], max = MAX_CORNERS): [number, number][] {
  const open =
    ring.length > 1 && ring[0][0] === ring.at(-1)![0] && ring[0][1] === ring.at(-1)![1]
      ? ring.slice(0, -1)
      : ring
  const step = Math.max(1, Math.ceil(open.length / max))
  return open.filter((_, i) => i % step === 0).map((p) => [p[0], p[1]])
}

function outlineOf(f: CountryFeature, lonLat: [number, number]): Area | null {
  const polygons = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates
  const hit = polygons.find((p) => geoContains({ type: 'Polygon', coordinates: p }, lonLat))
  if (!hit) return null
  const points = decimate(hit[0])
  const lons = points.map((p) => p[0])
  // landmasses across the antimeridian do not fit a simple polygon
  if (points.length < 3 || Math.max(...lons) - Math.min(...lons) > 180) return null
  return { kind: 'polygon', points }
}

/**
 * The country whose borders contain the point. Borders, not bounding boxes:
 * the box of the Netherlands reaches the Caribbean and covers Spain.
 */
export function findCountry(features: CountryFeature[], lat: number, lon: number): Country | null {
  // the exact point first, then a ring around it: harbours and estuaries fall
  // just outside borders drawn at 1:50m
  for (const d of [0, 0.1, 0.25]) {
    for (const [dx, dy] of d === 0 ? [[0, 0]] : NEARBY) {
      const lonLat: [number, number] = [lon + dx * d, lat + dy * d]
      const f = features.find((c) => geoContains(c, lonLat))
      if (f) return { name: f.properties.name, outline: outlineOf(f, lonLat) }
    }
  }
  return null
}

const NEARBY = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
]

let atlas: Promise<CountryFeature[]> | null = null

/** Natural Earth 1:50m borders, loaded the first time they are needed. */
function loadAtlas(): Promise<CountryFeature[]> {
  atlas ??= import('world-atlas/countries-50m.json').then((m) => {
    const topo = m.default as unknown as Topology
    const all = feature(topo, topo.objects.countries as GeometryCollection<{ name: string }>)
    return all.features as CountryFeature[]
  })
  return atlas
}

export async function countryAt(lat: number, lon: number): Promise<Country | null> {
  return findCountry(await loadAtlas(), lat, lon)
}
