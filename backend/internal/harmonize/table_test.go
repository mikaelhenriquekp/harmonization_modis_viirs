package harmonize

import "testing"

func TestSummaryAdd(t *testing.T) {
	s := Summary{}
	d := modisRow()
	s.Add(d)
	d.DayNight = 'N'
	d.FRP = 7.5
	s.Add(d)
	d.Date = "2015-09-01"
	s.Add(d)

	k := Key{Cell: CellOf(38.1, -1.2), Month: MustMonth("2015-08")}
	got := s[k]
	want := Counts{N: 2, Day: 1, Night: 1, FRP: 20}
	if got != want {
		t.Errorf("summary = %+v, want %+v", got, want)
	}
	if s.Total() != 3 {
		t.Errorf("Total = %v, want 3", s.Total())
	}
	if n := len(s.Cells()); n != 1 {
		t.Errorf("Cells = %d, want 1", n)
	}
}

func TestSummaryMerge(t *testing.T) {
	a, b := Summary{}, Summary{}
	a.Add(modisRow())
	b.Add(modisRow())
	b.Add(viirsRow())
	a.Merge(b)
	if a.Total() != 3 {
		t.Errorf("Total after merge = %v, want 3", a.Total())
	}
}

func TestBuildTableFullGridWithZeros(t *testing.T) {
	m, v := Summary{}, Summary{}
	m.Add(modisRow())
	m.Add(modisRow())
	other := viirsRow()
	other.Lat = 41.0
	for range 3 {
		v.Add(other)
	}
	months := []Month{MustMonth("2015-07"), MustMonth("2015-08")}
	rows := BuildTable(m, v, months)
	if len(rows) != 2*2 {
		t.Fatalf("rows = %d, want 4", len(rows))
	}
	var sm, sv float64
	seen := map[Key]bool{}
	for _, r := range rows {
		k := Key{Cell: r.Cell, Month: r.Month}
		if seen[k] {
			t.Fatalf("duplicate cell-month %+v", k)
		}
		seen[k] = true
		sm += r.M
		sv += r.V
		if r.Month == months[0] && (r.M != 0 || r.V != 0) {
			t.Errorf("July should be empty: %+v", r)
		}
	}
	if sm != 2 || sv != 3 {
		t.Errorf("totals M=%v V=%v, want 2 and 3", sm, sv)
	}
}

func TestBuildTableSplitsDayNightAndEnergy(t *testing.T) {
	m, v := Summary{}, Summary{}
	d := modisRow()
	m.Add(d)
	d.DayNight = 'N'
	m.Add(d)
	vd := viirsRow()
	v.Add(vd)
	rows := BuildTable(m, v, []Month{MustMonth("2015-08")})
	r := rows[0]
	if r.MDay != 1 || r.MNight != 1 || r.VDay != 0 || r.VNight != 1 || r.FM != 25 || r.FV != 3.1 {
		t.Errorf("row = %+v", r)
	}
}
