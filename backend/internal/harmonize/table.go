package harmonize

import "sort"

// Counts aggregates the detections of one cell and month.
type Counts struct {
	N     float64 `json:"n"`
	Day   float64 `json:"day"`
	Night float64 `json:"night"`
	FRP   float64 `json:"frp"` // sum of fire radiative power, MW
}

// Key identifies a cell and month.
type Key struct {
	Cell  Cell
	Month Month
}

// Summary holds per cell and month counts for one sensor.
type Summary map[Key]Counts

// Add counts one detection.
func (s Summary) Add(d Detection) {
	k := Key{Cell: CellOf(d.Lat, d.Lon), Month: MonthOfDate(d.Date)}
	c := s[k]
	c.N++
	if d.Day() {
		c.Day++
	} else {
		c.Night++
	}
	c.FRP += d.FRP
	s[k] = c
}

// Merge adds every count of o into s.
func (s Summary) Merge(o Summary) {
	for k, c := range o {
		cur := s[k]
		cur.N += c.N
		cur.Day += c.Day
		cur.Night += c.Night
		cur.FRP += c.FRP
		s[k] = cur
	}
}

// Total returns the number of detections.
func (s Summary) Total() float64 {
	var t float64
	for _, c := range s {
		t += c.N
	}
	return t
}

// Between returns the detections in [a, b], skipping the excluded months.
func (s Summary) Between(a, b Month, excluded ...Month) float64 {
	var t float64
	for k, c := range s {
		if k.Month >= a && k.Month <= b && !contains(excluded, k.Month) {
			t += c.N
		}
	}
	return t
}

// Cells returns the active cells, sorted.
func (s Summary) Cells() []Cell {
	set := map[Cell]struct{}{}
	for k := range s {
		set[k.Cell] = struct{}{}
	}
	return sortedCells(set)
}

// ByMonth returns the detections per month.
func (s Summary) ByMonth() map[Month]float64 {
	out := map[Month]float64{}
	for k, c := range s {
		out[k.Month] += c.N
	}
	return out
}

func sortedCells(set map[Cell]struct{}) []Cell {
	out := make([]Cell, 0, len(set))
	for c := range set {
		out = append(out, c)
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Lat != out[j].Lat {
			return out[i].Lat < out[j].Lat
		}
		return out[i].Lon < out[j].Lon
	})
	return out
}

func contains(ms []Month, m Month) bool {
	for _, x := range ms {
		if x == m {
			return true
		}
	}
	return false
}

// Row is one cell and month of the comparison table. M and V are the MODIS and
// VIIRS counts, FM and FV their energy (sum of FRP).
type Row struct {
	Cell   Cell
	Month  Month
	M      float64
	V      float64
	MDay   float64
	MNight float64
	VDay   float64
	VNight float64
	FM     float64
	FV     float64
}

// BuildTable returns the full grid: every cell active in either summary (in any
// month) times every requested month, zeros included.
func BuildTable(modis, viirs Summary, months []Month) []Row {
	set := map[Cell]struct{}{}
	for k := range modis {
		set[k.Cell] = struct{}{}
	}
	for k := range viirs {
		set[k.Cell] = struct{}{}
	}
	cells := sortedCells(set)
	rows := make([]Row, 0, len(cells)*len(months))
	for _, c := range cells {
		for _, m := range months {
			k := Key{Cell: c, Month: m}
			a, b := modis[k], viirs[k]
			rows = append(rows, Row{
				Cell: c, Month: m,
				M: a.N, MDay: a.Day, MNight: a.Night, FM: a.FRP,
				V: b.N, VDay: b.Day, VNight: b.Night, FV: b.FRP,
			})
		}
	}
	return rows
}

// AsEnergy returns the table with energy in place of counts, so the same
// models and exam can be reused for FRP.
func AsEnergy(rows []Row) []Row {
	out := make([]Row, len(rows))
	for i, r := range rows {
		out[i] = Row{Cell: r.Cell, Month: r.Month, M: r.FM, V: r.FV}
	}
	return out
}
