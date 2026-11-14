import { geoDistance, geoOrthographic, type GeoProjection } from 'd3-geo'

export type Rotation = [lambda: number, phi: number]

/** An orthographic globe of the given pixel size, rotated to [λ, φ]. */
export function makeProjection(size: number, rotate: Rotation): GeoProjection {
  return geoOrthographic()
    .scale(size / 2 - 2)
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
