package harmonize

import (
	"errors"
	"fmt"
	"sort"
)

// Source says where the value of a month comes from. Every month has exactly
// one source: satellites are never added together.
type Source string

// Sources of the harmonized series.
const (
	SourceAquaHarmonized Source = "aqua_harmonized" // 2002-07..2012-01, estimate of what VIIRS would have seen
	SourceSNPP           Source = "viirs_snpp"      // Suomi NPP yearly archive
	SourceRecent         Source = "viirs_recent"    // after the archive: Suomi NPP until 2026-11-01, NOAA-20 since
)

// Value is the hotspot count and energy of a cell and month.
type Value struct {
	Hotspots float64
	FRP      float64
}

// Segment is one source over a range of months.
type Segment struct {
	Values   map[Key]Value
	Source   Source
	From, To Month
}

// Point is one cell and month of the harmonized series.
type Point struct {
	Cell        Cell
	Month       Month
	Hotspots    float64
	FRP         float64
	Source      Source
	Provisional bool
}

// MinHotspots is the smallest value kept: anything that rounds to 0.0 is
// dropped (the count models give tiny values to every active cell).
const MinHotspots = 0.05

// ErrOverlap means two segments claim the same month.
var ErrOverlap = errors.New("months with more than one source")

// Assemble joins the segments into one series, sorted by month and cell.
func Assemble(segments []Segment, provisional map[Month]bool) ([]Point, error) {
	owner := map[Month]Source{}
	var out []Point
	for _, s := range segments {
		for k, v := range s.Values {
			if k.Month < s.From || k.Month > s.To {
				continue
			}
			if o, ok := owner[k.Month]; ok && o != s.Source {
				return nil, fmt.Errorf("%w: %s", ErrOverlap, k.Month)
			}
			owner[k.Month] = s.Source
			if v.Hotspots < MinHotspots {
				continue
			}
			out = append(out, Point{Cell: k.Cell, Month: k.Month, Hotspots: v.Hotspots, FRP: v.FRP,
				Source: s.Source, Provisional: provisional[k.Month]})
		}
	}
	sort.Slice(out, func(i, j int) bool {
		a, b := out[i], out[j]
		if a.Month != b.Month {
			return a.Month < b.Month
		}
		if a.Cell.Lat != b.Cell.Lat {
			return a.Cell.Lat < b.Cell.Lat
		}
		return a.Cell.Lon < b.Cell.Lon
	})
	return out, nil
}
