import type { Area } from './area'

export interface Place {
  id: string
  name: string
  note: string
  area: Area
}

/** Ready-made areas: the study's sample regions and well-known fire regimes. */
export const PLACES: Place[] = [
  {
    id: 'murcia',
    name: 'Región de Murcia',
    note: 'Mediterranean farmland and scrub',
    area: { kind: 'bbox', west: -2.35, south: 37.37, east: -0.65, north: 38.76 },
  },
  {
    id: 'iberia',
    name: 'Iberian Peninsula',
    note: 'Summer wildfires, winter farm burning',
    area: { kind: 'bbox', west: -9.6, south: 35.9, east: 4.4, north: 43.9 },
  },
  {
    id: 'greece',
    name: 'Greece',
    note: 'Mediterranean wildfires',
    area: { kind: 'bbox', west: 19.3, south: 34.8, east: 28.3, north: 41.8 },
  },
  {
    id: 'central-chile',
    name: 'Central Chile',
    note: 'Southern-hemisphere summer fires',
    area: { kind: 'bbox', west: -73.8, south: -38.5, east: -70, north: -32.5 },
  },
  {
    id: 'borneo',
    name: 'Malaysian Borneo',
    note: 'Peat and plantation fires',
    area: { kind: 'bbox', west: 109.5, south: 0.8, east: 119.3, north: 7.4 },
  },
  {
    id: 'amazon-arc',
    name: 'Amazon arc of deforestation',
    note: 'Land clearing in the dry season',
    area: { kind: 'bbox', west: -63, south: -13, east: -46, north: -3 },
  },
  {
    id: 'sahel',
    name: 'Sahel and Sudanian savanna',
    note: 'Savanna burning, Nov–Mar',
    area: { kind: 'bbox', west: -17, south: 7, east: 30, north: 15 },
  },
  {
    id: 'world',
    name: 'The whole world',
    note: 'Every harmonized hotspot',
    area: { kind: 'world' },
  },
]

export const DEFAULT_PLACE = PLACES[0]
