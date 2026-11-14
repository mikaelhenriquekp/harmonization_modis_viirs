import { geoDistance, geoOrthographic, type GeoProjection } from 'd3-geo'

export type Rotation = [lambda: number, phi: number]

/** Fewer to more hotspots in a cell of the globe. */
export const FIRE_COLORS = ['#6e2536', '#c23b54', '#e0623f', '#ee8f5a']

export const MIN_ZOOM = 1
export const MAX_ZOOM = 8

export function clampZoom(z: number): number {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z))
}

/** An orthographic globe of the given pixel size, rotated to [λ, φ] and magnified `zoom` times. */
export function makeProjection(size: number, rotate: Rotation, zoom = 1): GeoProjection {
  return geoOrthographic()
    .scale((size / 2 - 2) * zoom)
    .translate([size / 2, size / 2])
    .rotate([rotate[0], rotate[1], 0])
    .clipAngle(90)
    .precision(0.5)
}

/** Whether [lon, lat] faces the viewer. */
export function visible(lonLat: [number, number], rotate: Rotation): boolean {
  return geoDistance(lonLat, [-rotate[0], -rotate[1]]) < Math.PI / 2 - 0.02
}

/** The [lon, lat] under a pixel, or null when the pixel is off the globe. */
export function pointAt(p: GeoProjection, xy: [number, number]): [number, number] | null {
  const [cx, cy] = p.translate()
  if (Math.hypot(xy[0] - cx, xy[1] - cy) > p.scale()) return null
  const ll = p.invert?.(xy)
  return ll ? [ll[0], ll[1]] : null
}
