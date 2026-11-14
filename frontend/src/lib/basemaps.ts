/**
 * "Spectral vision": the map seen through each sensor, from NASA GIBS daily
 * imagery. These are pictures of the surface, not the hotspot detections.
 */
export interface Basemap {
  id: string
  label: string
  /** Satellite and instrument, or null for the plain reference map. */
  sensor: string | null
  /** What the composite shows, in one sentence. */
  reads: string
  /** GIBS layer identifier; null for the reference map. */
  layer: string | null
  format: 'jpg' | 'png'
  /** Deepest zoom GIBS serves; the map upscales beyond it. */
  level: number
  /** First day with imagery (YYYY-MM-DD). */
  since: string | null
}

export const BASEMAPS: Basemap[] = [
  {
    id: 'reference',
    label: 'None, plain map',
    sensor: null,
    reads: 'A muted map, so the fire data stands out.',
    layer: null,
    format: 'jpg',
    level: 16,
    since: null,
  },
  {
    id: 'aqua-true',
    label: 'True colour',
    sensor: 'MODIS, Aqua',
    reads: 'Bands 1-4-3, as the eye would see it: smoke plumes are grey-blue, clouds white.',
    layer: 'MODIS_Aqua_CorrectedReflectance_TrueColor',
    format: 'jpg',
    level: 9,
    since: '2002-07-04',
  },
  {
    id: 'aqua-721',
    label: 'Burn scars (shortwave infrared)',
    sensor: 'MODIS, Aqua',
    reads:
      'Shortwave infrared in red: burn scars look red-brown, vegetation bright green, and the infrared sees through thin smoke.',
    layer: 'MODIS_Aqua_CorrectedReflectance_Bands721',
    format: 'jpg',
    level: 9,
    since: '2002-07-04',
  },
  {
    id: 'snpp-true',
    label: 'True colour',
    sensor: 'VIIRS, Suomi NPP',
    reads: 'Bands I1-M4-M3, natural colour from the sensor that replaces MODIS.',
    layer: 'VIIRS_SNPP_CorrectedReflectance_TrueColor',
    format: 'jpg',
    level: 9,
    since: '2015-11-24',
  },
  {
    id: 'snpp-m11',
    label: 'Burn scars (shortwave infrared)',
    sensor: 'VIIRS, Suomi NPP',
    reads:
      'The VIIRS match of MODIS 7-2-1: burn scars red-brown, vegetation green, active fire fronts glow orange.',
    layer: 'VIIRS_SNPP_CorrectedReflectance_BandsM11-I2-I1',
    format: 'jpg',
    level: 9,
    since: '2015-11-24',
  },
  {
    id: 'n20-m11',
    label: 'Burn scars (shortwave infrared)',
    sensor: 'VIIRS, NOAA-20',
    reads: 'The same composite from NOAA-20, the satellite the record continues with.',
    layer: 'VIIRS_NOAA20_CorrectedReflectance_BandsM11-I2-I1',
    format: 'jpg',
    level: 9,
    since: '2018-01-05',
  },
]

export const DEFAULT_BASEMAP = BASEMAPS[0]

export function basemapById(id: string | null | undefined): Basemap {
  return BASEMAPS.find((b) => b.id === id) ?? DEFAULT_BASEMAP
}

/** Whether the sensor already had imagery on that day. */
export function hasImagery(b: Basemap, day: string): boolean {
  return !!b.layer && !!b.since && day >= b.since
}

/** The XYZ tile template of a GIBS layer on one day. */
export function gibsUrl(b: Basemap, day: string): string {
  return `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${b.layer}/default/${day}/GoogleMapsCompatible_Level${b.level}/{z}/{y}/{x}.${b.format}`
}
