package harmonize

import (
	"math"
	"strconv"
	"strings"
)

// Satellite is a normalized satellite code.
type Satellite string

// Satellites that FIRMS reports.
const (
	Aqua   Satellite = "AQUA"
	Terra  Satellite = "TERRA"
	SNPP   Satellite = "SNPP"
	NOAA20 Satellite = "N20"
	NOAA21 Satellite = "N21"
	Other  Satellite = "OTHER"
)

// IsMODIS reports whether the satellite carries MODIS.
func (s Satellite) IsMODIS() bool { return s == Aqua || s == Terra }

// NormalizeSatellite maps every spelling FIRMS uses (archive: "Aqua", "N",
// "N20"; near real time: "A", "T", "1", ...) to one code.
func NormalizeSatellite(s string) Satellite {
	switch strings.ToUpper(strings.TrimSpace(s)) {
	case "A", "AQUA":
		return Aqua
	case "T", "TERRA":
		return Terra
	case "N", "NPP", "SNPP", "SUOMI NPP", "SUOMI-NPP":
		return SNPP
	case "N20", "NOAA-20", "NOAA20", "J1", "1":
		return NOAA20
	case "N21", "NOAA-21", "NOAA21", "J2", "2":
		return NOAA21
	default:
		return Other
	}
}

// Detection is one active fire hotspot as FIRMS publishes it.
type Detection struct {
	Lat        float64
	Lon        float64
	Date       string // YYYY-MM-DD
	Time       int    // HHMM UTC
	Satellite  Satellite
	Confidence string // MODIS: 0-100, VIIRS: l/n/h
	FRP        float64
	Scan       float64
	Track      float64
	DayNight   byte // 'D' or 'N'
	Type       int  // 0 vegetation, 1 volcano, 2 static source, 3 offshore
	HasType    bool // near real time data has no type
}

// Provisional reports whether the detection comes from near real time data,
// which FIRMS has not classified yet.
func (d Detection) Provisional() bool { return !d.HasType }

// Day reports whether the detection was made on a daytime overpass.
func (d Detection) Day() bool { return d.DayNight == 'D' || d.DayNight == 'd' }

// MinModisConfidence is the lowest MODIS confidence that is kept.
const MinModisConfidence = 30

// Filter decides which detections enter the harmonization.
type Filter struct {
	Satellite Satellite
	Box       *BBox         // optional crop
	Mask      *FixedSources // optional: drops provisional detections on known fixed sources
}

// Keep reports whether a detection passes: the requested satellite, vegetation
// fires only (or unclassified near real time data), enough confidence and
// inside the box.
func (f Filter) Keep(d Detection) bool {
	if d.Satellite != f.Satellite {
		return false
	}
	if d.HasType && d.Type != 0 {
		return false
	}
	if f.Mask != nil && d.Provisional() && f.Mask.Has(d.Lat, d.Lon) {
		return false
	}
	if f.Satellite.IsMODIS() {
		c, err := strconv.ParseFloat(strings.TrimSpace(d.Confidence), 64)
		if err != nil || c < MinModisConfidence {
			return false
		}
	} else if c := strings.TrimSpace(d.Confidence); c != "" && (c[0] == 'l' || c[0] == 'L') {
		return false
	}
	return f.Box == nil || f.Box.Contains(d.Lat, d.Lon)
}

// FixedSources holds the ~1 km positions FIRMS classified as static non
// vegetation sources (type 2: industry, gas flares...).
type FixedSources struct {
	pos map[[2]int32]struct{}
}

// NewFixedSources returns an empty mask.
func NewFixedSources() *FixedSources {
	return &FixedSources{pos: map[[2]int32]struct{}{}}
}

func hundredths(v float64) int32 { return int32(math.Round(v * 100)) }

// Add marks a fixed source and its eight neighbors at 0.01° resolution.
func (m *FixedSources) Add(lat, lon float64) {
	a, b := hundredths(lat), hundredths(lon)
	for da := int32(-1); da <= 1; da++ {
		for db := int32(-1); db <= 1; db++ {
			m.pos[[2]int32{a + da, b + db}] = struct{}{}
		}
	}
}

// Has reports whether a coordinate falls on a marked position.
func (m *FixedSources) Has(lat, lon float64) bool {
	_, ok := m.pos[[2]int32{hundredths(lat), hundredths(lon)}]
	return ok
}

// Len returns the number of marked positions.
func (m *FixedSources) Len() int { return len(m.pos) }

// SolarHour returns local solar time: UTC hour plus longitude/15.
func SolarHour(hhmm int, lon float64) float64 {
	utc := float64(hhmm/100) + float64(hhmm%100)/60
	return math.Mod(math.Mod(utc+lon/15, 24)+24, 24)
}
