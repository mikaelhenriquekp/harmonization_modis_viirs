import type { Area } from './area'

export type Tool = 'polygon' | 'rectangle' | 'point'

export interface DrawingState {
  tool: Tool | null
  /** Vertices tapped so far, as [lat, lon]. */
  points: [number, number][]
  radiusKm: number
  /** The finished area, until the caller consumes it. */
  done: Area | null
}

export type DrawingAction =
  | { type: 'start'; tool: Tool }
  | { type: 'tap'; lat: number; lon: number }
  | { type: 'radius'; km: number }
  | { type: 'undo' }
  | { type: 'finish' }
  | { type: 'closeOnFirst' }
  | { type: 'cancel' }
  | { type: 'consumed' }

export const initialDrawing: DrawingState = { tool: null, points: [], radiusKm: 25, done: null }

function polygon(points: [number, number][]): Area {
  return { kind: 'polygon', points: points.map(([lat, lon]) => [lon, lat]) }
}

/** Drawing an area with taps only, so it works the same with a finger or a mouse. */
export function drawingReducer(s: DrawingState, a: DrawingAction): DrawingState {
  switch (a.type) {
    case 'start':
      return { ...s, tool: a.tool, points: [], done: null }
    case 'radius':
      return { ...s, radiusKm: a.km }
    case 'cancel':
      return { ...s, tool: null, points: [], done: null }
    case 'consumed':
      return { ...s, done: null }
    case 'undo':
      return { ...s, points: s.points.slice(0, -1) }
    case 'tap': {
      if (!s.tool) return s
      if (s.tool === 'point') {
        return {
          ...s,
          tool: null,
          points: [],
          done: { kind: 'point', lat: a.lat, lon: a.lon, radiusKm: s.radiusKm },
        }
      }
      const points = [...s.points, [a.lat, a.lon] as [number, number]]
      if (s.tool === 'rectangle' && points.length === 2) {
        const [[la1, lo1], [la2, lo2]] = points
        return {
          ...s,
          tool: null,
          points: [],
          done: {
            kind: 'bbox',
            west: Math.min(lo1, lo2),
            south: Math.min(la1, la2),
            east: Math.max(lo1, lo2),
            north: Math.max(la1, la2),
          },
        }
      }
      return { ...s, points }
    }
    case 'finish':
    case 'closeOnFirst':
      if (s.tool !== 'polygon' || s.points.length < 3) return s
      return { ...s, tool: null, points: [], done: polygon(s.points) }
  }
}
