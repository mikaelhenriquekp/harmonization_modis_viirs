import type { Resolution } from '@/api/firemap'

import { WORLD, type Area } from './area'

/** What a map shows: its edges in degrees and its zoom. */
export interface Viewport {
  west: number
  south: number
  east: number
  north: number
  zoom: number
}

/** A map cell size chosen by the user, or picked from the zoom. */
export type ResolutionChoice = Resolution | 'auto'

export const RESOLUTIONS: Resolution[] = [0.25, 0.5, 1, 2]

/** Most cells one map asks for: more would be slow to send and to draw. */
export const MAX_CELLS = 40_000

/** From this zoom on, single detections are worth asking for. */
export const DETECTIONS_ZOOM = 7

/** The cell size that keeps a view readable: coarse from afar, the 0.25° base grid from close. */
export function autoResolution(zoom: number): Resolution {
  if (zoom >= 6) return 0.25
  if (zoom >= 4) return 0.5
  return 1
}

/**
 * The area to ask the API for: the view widened to a coarse grid, so small
 * pans reuse the same request, or the whole world when the view is that wide.
 */
export function dataArea(v: Viewport): Area {
  const step = v.zoom >= 6 ? 5 : 10
  const west = Math.floor(v.west / step) * step
  const east = Math.ceil(v.east / step) * step
  if (east - west >= 180 || west < -180 || east > 180) return WORLD
  return {
    kind: 'bbox',
    west,
    east,
    south: Math.max(-90, Math.floor(v.south / step) * step),
    north: Math.min(90, Math.ceil(v.north / step) * step),
  }
}

/** Grid cells an area spans at a cell size. */
export function cellCount(area: Area, res: Resolution): number {
  if (area.kind !== 'bbox') return (360 / res) * (180 / res)
  return Math.ceil((area.east - area.west) / res) * Math.ceil((area.north - area.south) / res)
}

/** The cell size to ask for: the choice, made coarser until the area fits MAX_CELLS. */
export function fitResolution(area: Area, choice: ResolutionChoice, zoom: number): Resolution {
  const wanted = choice === 'auto' ? autoResolution(zoom) : choice
  // the whole world is only drawn at 1° or coarser; only burning cells come back, so it fits
  if (area.kind !== 'bbox') return wanted < 1 ? 1 : wanted
  return RESOLUTIONS.find((r) => r >= wanted && cellCount(area, r) <= MAX_CELLS) ?? 2
}
