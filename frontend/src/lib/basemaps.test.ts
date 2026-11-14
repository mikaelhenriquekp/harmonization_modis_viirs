import { describe, expect, it } from 'vitest'

import { basemapById, DEFAULT_BASEMAP, gibsUrl, hasImagery } from './basemaps'

describe('basemaps', () => {
  it('falls back to the reference map', () => {
    expect(basemapById('nope')).toBe(DEFAULT_BASEMAP)
    expect(basemapById(null)).toBe(DEFAULT_BASEMAP)
  })

  it('only offers imagery from the day the sensor flew', () => {
    const viirs = basemapById('snpp-true')
    expect(hasImagery(viirs, '2010-08-15')).toBe(false)
    expect(hasImagery(viirs, '2020-08-15')).toBe(true)
    expect(hasImagery(DEFAULT_BASEMAP, '2020-08-15')).toBe(false)
  })

  it('builds the GIBS tile template of a day', () => {
    expect(gibsUrl(basemapById('aqua-721'), '2017-08-15')).toBe(
      'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Aqua_CorrectedReflectance_Bands721/default/2017-08-15/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg',
    )
  })
})
