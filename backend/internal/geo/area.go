// Package geo parses the area of interest of a request into ranges of grid
// cells, the unit the harmonized data is stored in.
package geo

import (
	"crypto/sha1" //nolint:gosec // a cache key, not security
	"encoding/hex"
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

// Polygon limits.
const (
	MaxPolygonVertices = 200
	MaxPolygonCells    = 50000
)

// ArgCount is the number of SQL arguments Args returns.
const ArgCount = 8

// Area is a set of grid cells: a range of latitude cells and one or two
// ranges of longitude cells (two when the box crosses the antimeridian). A
// polygon narrows the ranges down to the cells in Mask.
type Area struct {
	LatMin, LatMax int16
	Lon            [][2]int16
	World          bool
	BBox           [4]float64   // requested west, south, east, north (of the polygon, if any)
	Polygon        [][2]float64 // lon, lat vertices
	Mask           [][2]int16   // lat, lon cells whose center is inside the polygon
	mask           map[[2]int16]bool
}

// ErrInvalidArea means the area parameters are wrong.
var ErrInvalidArea = errors.New("invalid area")

func invalid(format string, a ...any) error {
	return fmt.Errorf("%w: %s", ErrInvalidArea, fmt.Sprintf(format, a...))
}

// ParseArea reads "polygon=lon,lat,lon,lat,...", "bbox=west,south,east,north"
// (FIRMS order), or "lat", "lon" and an optional "radius_km". Without any, the
// area is the whole world.
func ParseArea(q url.Values) (Area, error) {
	switch {
	case q.Get("polygon") != "":
		return parsePolygon(q.Get("polygon"))
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
	if a.Polygon != nil {
		return len(a.Mask)
	}
	n := 0
	for _, r := range a.Lon {
		n += int(r[1]-r[0]) + 1
	}
	return n * (int(a.LatMax-a.LatMin) + 1)
}

// ContainsCell reports whether a cell is in the area.
func (a Area) ContainsCell(lat, lon int16) bool {
	if a.Polygon != nil {
		return a.mask[[2]int16{lat, lon}]
	}
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

// ContainsPoint reports whether a coordinate is in the requested area: inside
// the polygon, or the box.
func (a Area) ContainsPoint(lat, lon float64) bool {
	if a.World {
		return true
	}
	if a.Polygon != nil {
		return insidePolygon(a.Polygon, lon, lat)
	}
	w, s, e, n := a.BBox[0], a.BBox[1], a.BBox[2], a.BBox[3]
	if lat < s || lat > n {
		return false
	}
	if w < e {
		return lon >= w && lon <= e
	}
	return lon >= w || lon <= e
}

// Args are the ArgCount SQL arguments of Condition: the latitude range, two
// longitude ranges (an unused second range is empty, 1..0) and the cells of
// the polygon mask (empty arrays without a polygon).
func (a Area) Args() []any {
	b := [2]int16{1, 0}
	if len(a.Lon) > 1 {
		b = a.Lon[1]
	}
	lats, lons := make([]int16, len(a.Mask)), make([]int16, len(a.Mask))
	for i, c := range a.Mask {
		lats[i], lons[i] = c[0], c[1]
	}
	return []any{a.LatMin, a.LatMax, a.Lon[0][0], a.Lon[0][1], b[0], b[1], lats, lons}
}

// Key identifies the cells of the area, for caching.
func (a Area) Key() string {
	k := fmt.Sprint(a.Args()[:6])
	if a.Polygon == nil {
		return k
	}
	h := sha1.New()
	for _, c := range a.Mask {
		fmt.Fprintf(h, "%d,%d;", c[0], c[1])
	}
	return k + hex.EncodeToString(h.Sum(nil))
}

// Condition is the SQL filter matching Args, with placeholders starting at
// $first.
func Condition(first int) string {
	p := func(i int) string { return "$" + strconv.Itoa(first+i) }
	return fmt.Sprintf("cell_lat BETWEEN %s AND %s AND (cell_lon BETWEEN %s AND %s OR cell_lon BETWEEN %s AND %s)"+
		" AND (cardinality(%s::smallint[]) = 0 OR (cell_lat, cell_lon) IN (SELECT * FROM unnest(%s::smallint[], %s::smallint[])))",
		p(0), p(1), p(2), p(3), p(4), p(5), p(6), p(6), p(7))
}

func parsePolygon(s string) (Area, error) {
	vals := strings.Split(strings.TrimSuffix(s, ","), ",")
	if len(vals)%2 != 0 || len(vals) < 6 || len(vals) > 2*MaxPolygonVertices {
		return Area{}, invalid("polygon needs 3 to %d vertices as lon,lat,lon,lat,...", MaxPolygonVertices)
	}
	poly := make([][2]float64, len(vals)/2)
	w, south, e, n := 180.0, 90.0, -180.0, -90.0
	for i := range poly {
		lon, err1 := strconv.ParseFloat(strings.TrimSpace(vals[2*i]), 64)
		lat, err2 := strconv.ParseFloat(strings.TrimSpace(vals[2*i+1]), 64)
		if err1 != nil || err2 != nil || math.IsNaN(lon) || math.IsNaN(lat) || lat < -90 || lat > 90 || lon < -180 || lon > 180 {
			return Area{}, invalid("polygon vertex %s,%s is not a valid lon,lat", vals[2*i], vals[2*i+1])
		}
		poly[i] = [2]float64{lon, lat}
		w, e, south, n = math.Min(w, lon), math.Max(e, lon), math.Min(south, lat), math.Max(n, lat)
	}
	if e-w > 180 {
		return Area{}, invalid("polygons crossing the antimeridian are not supported; use a bbox")
	}
	a, err := fromBBox(w, south, e, n)
	if err != nil {
		return Area{}, err
	}
	if box := (int(a.LatMax-a.LatMin) + 1) * (int(a.Lon[0][1]-a.Lon[0][0]) + 1); box > MaxPolygonCells {
		return Area{}, invalid("the polygon is too large (%d cells, at most %d); use a bbox", box, MaxPolygonCells)
	}
	a.Polygon, a.mask = poly, map[[2]int16]bool{}
	for i := a.LatMin; i <= a.LatMax; i++ {
		for j := a.Lon[0][0]; j <= a.Lon[0][1]; j++ {
			lat, lon := (float64(i)+0.5)*harmonize.CellSize, (float64(j)+0.5)*harmonize.CellSize
			if insidePolygon(poly, lon, lat) {
				a.add(i, j)
			}
		}
	}
	if len(a.Mask) == 0 { // smaller than a cell: keep the cells it touches
		for _, v := range poly {
			c := harmonize.CellOf(v[1], v[0])
			a.add(int16(c.Lat), int16(c.Lon))
		}
	}
	return a, nil
}

func (a *Area) add(lat, lon int16) {
	k := [2]int16{lat, lon}
	if !a.mask[k] {
		a.mask[k] = true
		a.Mask = append(a.Mask, k)
	}
}

// insidePolygon is the even-odd ray casting test.
func insidePolygon(poly [][2]float64, x, y float64) bool {
	in := false
	for i, j := 0, len(poly)-1; i < len(poly); j, i = i, i+1 {
		xi, yi, xj, yj := poly[i][0], poly[i][1], poly[j][0], poly[j][1]
		if (yi > y) != (yj > y) && x < (xj-xi)*(y-yi)/(yj-yi)+xi {
			in = !in
		}
	}
	return in
}
