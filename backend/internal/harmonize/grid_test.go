package harmonize

import "testing"

func TestMonth(t *testing.T) {
	tests := []struct {
		in        string
		year, cal int
	}{
		{"2002-07", 2002, 7},
		{"2012-01", 2012, 1},
		{"2026-12", 2026, 12},
	}
	for _, tt := range tests {
		t.Run(tt.in, func(t *testing.T) {
			m, err := ParseMonth(tt.in)
			if err != nil {
				t.Fatal(err)
			}
			if m.Year() != tt.year || m.Calendar() != tt.cal {
				t.Errorf("ParseMonth(%q) = %d-%d, want %d-%d", tt.in, m.Year(), m.Calendar(), tt.year, tt.cal)
			}
			if m.String() != tt.in {
				t.Errorf("String() = %q, want %q", m.String(), tt.in)
			}
		})
	}
	if _, err := ParseMonth("2026-13"); err == nil {
		t.Error("ParseMonth accepted month 13")
	}
	if got := MustMonth("2012-01").Add(1); got != MustMonth("2012-02") {
		t.Errorf("Add(1) = %s", got)
	}
	if got := MonthOfDate("2015-08-31"); got != MustMonth("2015-08") {
		t.Errorf("MonthOfDate = %s", got)
	}
	if got := len(MonthRange(MustMonth("2012-02"), MustMonth("2017-12"))); got != 71 {
		t.Errorf("MonthRange len = %d, want 71", got)
	}
}

func TestCellOf(t *testing.T) {
	tests := []struct {
		lat, lon         float64
		wantLat, wantLon float64
	}{
		{37.99, -1.13, 37.875, -1.125}, // same case as the PoC test
		{38.0, -1.0, 38.125, -0.875},
		{0.01, 0.01, 0.125, 0.125},
		{-0.01, -0.01, -0.125, -0.125},
		{89.99, 179.99, 89.875, 179.875},
	}
	for _, tt := range tests {
		c := CellOf(tt.lat, tt.lon)
		lat, lon := c.Center()
		if lat != tt.wantLat || lon != tt.wantLon {
			t.Errorf("CellOf(%v, %v).Center() = (%v, %v), want (%v, %v)", tt.lat, tt.lon, lat, lon, tt.wantLat, tt.wantLon)
		}
		if back := CellOf(lat, lon); back != c {
			t.Errorf("CellOf(center) = %+v, want %+v", back, c)
		}
	}
}

func TestBBoxContains(t *testing.T) {
	b := BBox{LatMin: 35.9, LatMax: 43.9, LonMin: -9.6, LonMax: 4.4}
	if !b.Contains(40, 0) || b.Contains(28, -15) || !b.Contains(35.9, -9.6) {
		t.Error("Contains is wrong")
	}
}
