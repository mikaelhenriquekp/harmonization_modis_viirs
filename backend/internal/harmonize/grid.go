// Package harmonize turns MODIS (Aqua) and VIIRS active fire hotspots into one
// consistent monthly series on a 0.25° grid. It is pure computation: it does
// not download data or touch the database.
package harmonize

import (
	"fmt"
	"math"
	"strconv"
)

// CellSize is the grid resolution in degrees (~25 km).
const CellSize = 0.25

// Month is a calendar month encoded as year*12 + (month-1).
type Month int

// NewMonth builds a Month from a year and a 1-based calendar month.
func NewMonth(year, month int) Month { return Month(year*12 + month - 1) }

// ParseMonth parses "YYYY-MM".
func ParseMonth(s string) (Month, error) {
	if len(s) != 7 || s[4] != '-' {
		return 0, fmt.Errorf("invalid month %q, want YYYY-MM", s)
	}
	y, err1 := strconv.Atoi(s[:4])
	m, err2 := strconv.Atoi(s[5:])
	if err1 != nil || err2 != nil || m < 1 || m > 12 {
		return 0, fmt.Errorf("invalid month %q, want YYYY-MM", s)
	}
	return NewMonth(y, m), nil
}

// MustMonth is ParseMonth for constants; it panics on bad input.
func MustMonth(s string) Month {
	m, err := ParseMonth(s)
	if err != nil {
		panic(err)
	}
	return m
}

// MonthOfDate returns the month of an ISO date "YYYY-MM-DD". It returns -1 when
// the date is malformed.
func MonthOfDate(date string) Month {
	if len(date) < 7 {
		return -1
	}
	m, err := ParseMonth(date[:7])
	if err != nil {
		return -1
	}
	return m
}

// Year returns the calendar year.
func (m Month) Year() int { return int(m) / 12 }

// Calendar returns the 1-based month of the year.
func (m Month) Calendar() int { return int(m)%12 + 1 }

// Add returns the month n months later.
func (m Month) Add(n int) Month { return m + Month(n) }

// String formats the month as "YYYY-MM".
func (m Month) String() string { return fmt.Sprintf("%04d-%02d", m.Year(), m.Calendar()) }

// MonthRange lists every month from a to b, both included.
func MonthRange(a, b Month) []Month {
	if b < a {
		return nil
	}
	out := make([]Month, 0, int(b-a)+1)
	for m := a; m <= b; m++ {
		out = append(out, m)
	}
	return out
}

// Cell identifies a grid cell by its integer indices: floor(lat/CellSize) and
// floor(lon/CellSize).
type Cell struct {
	Lat int32 `json:"i"`
	Lon int32 `json:"j"`
}

// CellOf returns the cell that contains a coordinate.
func CellOf(lat, lon float64) Cell {
	return Cell{Lat: int32(math.Floor(lat / CellSize)), Lon: int32(math.Floor(lon / CellSize))}
}

// Center returns the cell center in degrees.
func (c Cell) Center() (lat, lon float64) {
	return (float64(c.Lat) + 0.5) * CellSize, (float64(c.Lon) + 0.5) * CellSize
}

// BBox is a latitude/longitude rectangle, edges included.
type BBox struct {
	LatMin float64 `json:"lat_min"`
	LatMax float64 `json:"lat_max"`
	LonMin float64 `json:"lon_min"`
	LonMax float64 `json:"lon_max"`
}

// Contains reports whether a coordinate falls inside the box.
func (b BBox) Contains(lat, lon float64) bool {
	return lat >= b.LatMin && lat <= b.LatMax && lon >= b.LonMin && lon <= b.LonMax
}
