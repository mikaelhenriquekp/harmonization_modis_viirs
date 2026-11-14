/** The area of interest the user picked. Coordinates are degrees. */
export type Area =
  | { kind: 'world' }
  | { kind: 'bbox'; west: number; south: number; east: number; north: number }
  | { kind: 'point'; lat: number; lon: number; radiusKm: number }
  | { kind: 'polygon'; points: [lon: number, lat: number][] }

export type Bounds = [[south: number, west: number], [north: number, east: number]]

export const WORLD: Area = { kind: 'world' }

const KM_PER_DEGREE = 111.32

function num(v: number): string {
  return String(Math.round(v * 1e4) / 1e4)
}

/** Query parameters the API understands for an area. */
export function areaToParams(area: Area): Record<string, string> {
  switch (area.kind) {
    case 'world':
      return {}
    case 'bbox':
      return { bbox: [area.west, area.south, area.east, area.north].map(num).join(',') }
    case 'point':
      return { lat: num(area.lat), lon: num(area.lon), radius_km: num(area.radiusKm) }
    case 'polygon':
      return { polygon: area.points.flatMap(([lon, lat]) => [num(lon), num(lat)]).join(',') }
  }
}

/** Compact form for the URL, e.g. "bbox:-2.35,37.37,-0.65,38.76". */
export function areaToSearch(area: Area): string {
  switch (area.kind) {
    case 'world':
      return 'world'
    case 'bbox':
      return `bbox:${areaToParams(area).bbox}`
    case 'point':
      return `point:${num(area.lat)},${num(area.lon)},${num(area.radiusKm)}`
    case 'polygon':
      return `polygon:${areaToParams(area).polygon}`
  }
}

function numbers(s: string): number[] | null {
  const v = s.split(',').map(Number)
  return v.every(Number.isFinite) ? v : null
}

const inLat = (v: number) => v >= -90 && v <= 90
const inLon = (v: number) => v >= -180 && v <= 180

/** Reads an area from the URL; null when it is missing or invalid. */
export function parseAreaSearch(s: string | null): Area | null {
  if (!s) return null
  if (s === 'world') return WORLD
  const [kind, rest = ''] = s.split(':')
  const v = numbers(rest)
  if (!v) return null
  switch (kind) {
    case 'bbox': {
      const [west, south, east, north] = v
      if (
        v.length !== 4 ||
        !(south < north) ||
        !inLat(south) ||
        !inLat(north) ||
        !inLon(west) ||
        !inLon(east)
      ) {
        return null
      }
      return { kind: 'bbox', west, south, east, north }
    }
    case 'point': {
      const [lat, lon, radiusKm] = v
      if (v.length !== 3 || !inLat(lat) || !inLon(lon) || !(radiusKm > 0)) return null
      return { kind: 'point', lat, lon, radiusKm }
    }
    case 'polygon': {
      if (v.length < 6 || v.length % 2 !== 0) return null
      const points: [number, number][] = []
      for (let i = 0; i < v.length; i += 2) {
        if (!inLon(v[i]) || !inLat(v[i + 1])) return null
        points.push([v[i], v[i + 1]])
      }
      return { kind: 'polygon', points }
    }
    default:
      return null
  }
}

/** South-west and north-east corners, to fit the map; null for the world. */
export function areaBounds(area: Area): Bounds | null {
  switch (area.kind) {
    case 'world':
      return null
    case 'bbox':
      return [
        [area.south, area.west],
        [area.north, area.east],
      ]
    case 'point': {
      const dLat = area.radiusKm / KM_PER_DEGREE
      const dLon =
        area.radiusKm / (KM_PER_DEGREE * Math.max(Math.cos((area.lat * Math.PI) / 180), 0.01))
      return [
        [area.lat - dLat, area.lon - dLon],
        [area.lat + dLat, area.lon + dLon],
      ]
    }
    case 'polygon': {
      const lons = area.points.map((p) => p[0])
      const lats = area.points.map((p) => p[1])
      return [
        [Math.min(...lats), Math.min(...lons)],
        [Math.max(...lats), Math.max(...lons)],
      ]
    }
  }
}
