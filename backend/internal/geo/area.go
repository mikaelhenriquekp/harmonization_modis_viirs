// Package geo parses the area of interest of a request into ranges of grid
// cells, the unit the harmonized data is stored in.
package geo

import (
	"errors"
	"fmt"
	"math"
	"net/url"
	"strconv"
	"strings"

	"github.com/nasa-challenge/app/backend/internal/harmonize"
)

// Radius limits for a point query, in km.
const (
	DefaultRadiusKm = 25.0
	MaxRadiusKm     = 1000.0
)

const kmPerDegree = 111.32

// Area is a set of grid cells: a range of latitude cells and one or two
// ranges of longitude cells (two when the box crosses the antimeridian).
type Area struct {
	LatMin, LatMax int16
	Lon            [][2]int16
	World          bool
	BBox           [4]float64 // requested west, south, east, north
}

// ErrInvalidArea means the area parameters are wrong.
var ErrInvalidArea = errors.New("invalid area")

func invalid(format string, a ...any) error {
	return fmt.Errorf("%w: %s", ErrInvalidArea, fmt.Sprintf(format, a...))
}

// ParseArea reads "bbox=west,south,east,north" (FIRMS order), or "lat", "lon"
// and an optional "radius_km". Without any, the area is the whole world.
func ParseArea(q url.Values) (Area, error) {
	switch {
	case q.Get("bbox") != "":
		parts := strings.Split(q.Get("bbox"), ",")
		if len(parts) != 4 {
			return Area{}, invalid("bbox must be west,south,east,north")
		}
		var v [4]float64
		for i, p := range parts {
			f, err := strconv.ParseFloat(strings.TrimSpace(p), 64)
			if err != nil || math.IsNaN(f) {
				return Area{}, invalid("bbox value %q is not a number", p)
			}
			v[i] = f
		}
		return fromBBox(v[0], v[1], v[2], v[3])
	case q.Get("lat") != "" || q.Get("lon") != "":
		lat, err1 := strconv.ParseFloat(q.Get("lat"), 64)
		lon, err2 := strconv.ParseFloat(q.Get("lon"), 64)
		if err1 != nil || err2 != nil {
			return Area{}, invalid("lat and lon must both be numbers")
		}
		r := DefaultRadiusKm
		if s := q.Get("radius_km"); s != "" {
			var err error
			if r, err = strconv.ParseFloat(s, 64); err != nil || r <= 0 || r > MaxRadiusKm {
				return Area{}, invalid("radius_km must be between 0 and %.0f", MaxRadiusKm)
			}
		}
		if lat < -90 || lat > 90 || lon < -180 || lon > 180 {
			return Area{}, invalid("lat must be in [-90, 90] and lon in [-180, 180]")
		}
		dLat := r / kmPerDegree
		dLon := r / (kmPerDegree * math.Max(math.Cos(lat*math.Pi/180), 0.01))
		west, east := wrap(lon-dLon), wrap(lon+dLon)
		if dLon >= 180 {
			west, east = -180, 180
		}
		return fromBBox(west, math.Max(lat-dLat, -90), east, math.Min(lat+dLat, 90))
	}
	a, _ := fromBBox(-180, -90, 180, 90)
	a.World = true
	return a, nil
}

func wrap(lon float64) float64 {
	for lon > 180 {
		lon -= 360
	}
	for lon < -180 {
		lon += 360
	}
	return lon
}

func fromBBox(west, south, east, north float64) (Area, error) {
	if south < -90 || north > 90 || west < -180 || west > 180 || east < -180 || east > 180 {
		return Area{}, invalid("latitudes must be in [-90, 90] and longitudes in [-180, 180]")
	}
	if south >= north {
		return Area{}, invalid("south must be below north")
	}
	if west == east {
		return Area{}, invalid("west and east must differ")
	}
	a := Area{BBox: [4]float64{west, south, east, north}}
	a.LatMin, a.LatMax = cellRange(south, north, 359)
	if west < east {
		lo, hi := cellRange(west, east, 719)
		a.Lon = [][2]int16{{lo, hi}}
	} else {
		lo, _ := cellRange(west, 180, 719)
		_, hi := cellRange(-180, east, 719)
		a.Lon = [][2]int16{{lo, 719}, {-720, hi}}
	}
	return a, nil
}

// cellRange returns the cells that intersect [lo, hi].
func cellRange(lo, hi float64, maxCell int16) (int16, int16) {
	first := int16(math.Floor(lo / harmonize.CellSize))
	last := int16(math.Ceil(hi/harmonize.CellSize)) - 1
	return first, min(max(last, first), maxCell)
}

// GridBBox is the box covered by the cells: west, south, east, north.
func (a Area) GridBBox() [4]float64 {
	s := harmonize.CellSize
	return [4]float64{
		float64(a.Lon[0][0]) * s, float64(a.LatMin) * s,
		float64(a.Lon[len(a.Lon)-1][1]+1) * s, float64(a.LatMax+1) * s,
	}
}

// Cells is the number of cells in the area.
func (a Area) Cells() int {
	n := 0
	for _, r := range a.Lon {
		n += int(r[1]-r[0]) + 1
	}
	return n * (int(a.LatMax-a.LatMin) + 1)
}

// ContainsCell reports whether a cell is in the area.
func (a Area) ContainsCell(lat, lon int16) bool {
	if lat < a.LatMin || lat > a.LatMax {
		return false
	}
	for _, r := range a.Lon {
		if lon >= r[0] && lon <= r[1] {
			return true
		}
	}
	return false
}

// Args are the SQL arguments for the condition
// cell_lat BETWEEN $1 AND $2 AND (cell_lon BETWEEN $3 AND $4 OR cell_lon BETWEEN $5 AND $6).
// An unused second range is empty (1..0).
func (a Area) Args() []any {
	b := [2]int16{1, 0}
	if len(a.Lon) > 1 {
		b = a.Lon[1]
	}
	return []any{a.LatMin, a.LatMax, a.Lon[0][0], a.Lon[0][1], b[0], b[1]}
}

// Condition is the SQL filter matching Args, with placeholders starting at
// $first.
func Condition(first int) string {
	p := func(i int) string { return "$" + strconv.Itoa(first+i) }
	return fmt.Sprintf("cell_lat BETWEEN %s AND %s AND (cell_lon BETWEEN %s AND %s OR cell_lon BETWEEN %s AND %s)",
		p(0), p(1), p(2), p(3), p(4), p(5))
}
