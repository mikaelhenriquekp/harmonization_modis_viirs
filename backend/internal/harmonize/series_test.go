package harmonize

import (
	"errors"
	"testing"
)

func flat(from, to string, hotspots float64) map[Key]Value {
	out := map[Key]Value{}
	for _, m := range MonthRange(MustMonth(from), MustMonth(to)) {
		out[Key{Cell: CellOf(38.1, -1.1), Month: m}] = Value{Hotspots: hotspots, FRP: hotspots * 10}
	}
	return out
}

func TestAssembleOneSatellitePerEpoch(t *testing.T) {
	got, err := Assemble([]Segment{
		{Values: flat("2002-07", "2021-12", 40), Source: SourceAquaHarmonized, From: MustMonth("2002-07"), To: MustMonth("2012-01")},
		{Values: flat("2012-01", "2026-11", 41), Source: SourceSNPP, From: MustMonth("2012-02"), To: MustMonth("2026-10")},
		{Values: flat("2018-04", "2026-11", 43), Source: SourceRecent, From: MustMonth("2026-11"), To: MustMonth("2026-11")},
	}, nil)
	if err != nil {
		t.Fatal(err)
	}
	seen := map[Month]Source{}
	for _, p := range got {
		if _, dup := seen[p.Month]; dup {
			t.Fatalf("month %s appears twice", p.Month)
		}
		seen[p.Month] = p.Source
	}
	for m, want := range map[string]Source{"2011-12": SourceAquaHarmonized, "2012-02": SourceSNPP, "2026-11": SourceRecent} {
		if seen[MustMonth(m)] != want {
			t.Errorf("%s from %s, want %s", m, seen[MustMonth(m)], want)
		}
	}
	if got[0].Month != MustMonth("2002-07") || got[len(got)-1].Month != MustMonth("2026-11") {
		t.Errorf("range %s..%s", got[0].Month, got[len(got)-1].Month)
	}
	if got[0].FRP != 400 {
		t.Errorf("energy not kept: %v", got[0].FRP)
	}
}

func TestAssembleRejectsOverlappingSources(t *testing.T) {
	_, err := Assemble([]Segment{
		{Values: flat("2012-01", "2012-03", 1), Source: SourceAquaHarmonized, From: MustMonth("2012-01"), To: MustMonth("2012-02")},
		{Values: flat("2012-01", "2012-03", 1), Source: SourceSNPP, From: MustMonth("2012-02"), To: MustMonth("2012-03")},
	}, nil)
	if !errors.Is(err, ErrOverlap) {
		t.Errorf("err = %v, want ErrOverlap", err)
	}
}

func TestAssembleDropsEmptyAndMarksProvisional(t *testing.T) {
	v := flat("2026-01", "2026-02", 2)
	v[Key{Cell: CellOf(10, 10), Month: MustMonth("2026-01")}] = Value{Hotspots: 0.04}
	got, err := Assemble([]Segment{{Values: v, Source: SourceRecent, From: MustMonth("2026-01"), To: MustMonth("2026-02")}},
		map[Month]bool{MustMonth("2026-02"): true})
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 2 {
		t.Fatalf("points = %d, want 2 (values that round to 0 are dropped)", len(got))
	}
	if got[0].Provisional || !got[1].Provisional {
		t.Errorf("provisional flags = %v %v", got[0].Provisional, got[1].Provisional)
	}
}
