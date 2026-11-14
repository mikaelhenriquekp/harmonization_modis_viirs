package calendar

import (
	"context"
	"errors"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/nasa-challenge/app/backend/internal/geo"
	"github.com/nasa-challenge/app/backend/internal/harmonize"
)

type fakeRepo struct {
	totals  []MonthTotal
	sensors []SensorTotal
	regions []RegionNote
	end     harmonize.Month
	last    time.Time
	err     error
	calls   int
}

func (f *fakeRepo) MonthlyTotals(_ context.Context, _ geo.Area, from, to, _ harmonize.Month) ([]MonthTotal, error) {
	f.calls++
	var out []MonthTotal
	for _, t := range f.totals {
		if t.Month >= from && t.Month <= to {
			out = append(out, t)
		}
	}
	return out, f.err
}

func (f *fakeRepo) SensorTotals(context.Context, geo.Area, harmonize.Month, harmonize.Month) ([]SensorTotal, error) {
	return f.sensors, f.err
}

func (f *fakeRepo) ArchiveEnd(context.Context) (harmonize.Month, error) { return f.end, f.err }

func (f *fakeRepo) LastDay(context.Context) (time.Time, error) { return f.last, f.err }

func (f *fakeRepo) RegionsIn(context.Context, geo.Area) ([]RegionNote, error) {
	return f.regions, f.err
}

func area(t *testing.T, q string) geo.Area {
	t.Helper()
	v, _ := url.ParseQuery(q)
	a, err := geo.ParseArea(v)
	if err != nil {
		t.Fatal(err)
	}
	return a
}

func fixedNow() time.Time { return time.Date(2026, 11, 14, 12, 0, 0, 0, time.UTC) }

func TestServiceCalendar(t *testing.T) {
	repo := &fakeRepo{totals: history("2026-10"), end: harmonize.MustMonth("2025-12"), regions: []RegionNote{
		{ID: "Spain", Name: "Spain", Status: "ok", Quality: "good", Scope: "own"},
		{ID: "Andorra", Name: "Andorra", Status: "ok", Quality: "review", Scope: "regional", PooledWith: []string{"Spain"}},
		{ID: "Monaco", Name: "Monaco", Status: "insufficient_data"},
	}}
	svc := NewService(repo, fixedNow)
	got, err := svc.Calendar(t.Context(), area(t, "bbox=-2.35,37.37,-0.65,38.76"), harmonize.MustMonth("2002-07"), harmonize.MustMonth("2026-11"))
	if err != nil {
		t.Fatal(err)
	}
	if got.Area.Cells != 56 || got.Area.GridBBox != [4]float64{-2.5, 37.25, -0.5, 39} {
		t.Errorf("area = %+v", got.Area)
	}
	if got.ArchiveEnd != "2025-12" || got.Calendar.To != "2026-11" || got.Attribution == "" {
		t.Errorf("archive_end=%s to=%s", got.ArchiveEnd, got.Calendar.To)
	}
	text := strings.Join(got.Notes, " ")
	for _, want := range []string{"estimate", "Andorra", "Monaco", "incomplete"} {
		if !strings.Contains(text, want) {
			t.Errorf("notes miss %q: %v", want, got.Notes)
		}
	}

	// the same question is answered from the cache
	if _, err := svc.Calendar(t.Context(), area(t, "bbox=-2.35,37.37,-0.65,38.76"), harmonize.MustMonth("2002-07"), harmonize.MustMonth("2026-11")); err != nil {
		t.Fatal(err)
	}
	if repo.calls != 1 {
		t.Errorf("repository called %d times, want 1 (cached)", repo.calls)
	}
}

func TestServiceCalendarError(t *testing.T) {
	svc := NewService(&fakeRepo{err: errors.New("boom")}, fixedNow)
	if _, err := svc.Calendar(t.Context(), area(t, ""), FirstMonth, harmonize.MustMonth("2026-11")); err == nil {
		t.Error("want error")
	}
}

func TestServiceSensors(t *testing.T) {
	repo := &fakeRepo{
		end:    harmonize.MustMonth("2025-12"),
		totals: []MonthTotal{{Month: harmonize.MustMonth("2015-08"), Hotspots: 410}, {Month: harmonize.MustMonth("2019-08"), Hotspots: 390}},
		sensors: []SensorTotal{
			{Sensor: "aqua", Month: harmonize.MustMonth("2015-08"), Hotspots: 100},
			{Sensor: "snpp", Month: harmonize.MustMonth("2015-08"), Hotspots: 400},
			{Sensor: "aqua", Month: harmonize.MustMonth("2019-08"), Hotspots: 100},
			{Sensor: "snpp", Month: harmonize.MustMonth("2019-08"), Hotspots: 380},
			{Sensor: "n20", Month: harmonize.MustMonth("2019-08"), Hotspots: 390},
		},
	}
	got, err := NewService(repo, fixedNow).Sensors(t.Context(), area(t, ""), harmonize.MustMonth("2015-08"), harmonize.MustMonth("2019-08"))
	if err != nil {
		t.Fatal(err)
	}
	if len(got.Months) != 49 {
		t.Fatalf("months = %d", len(got.Months))
	}
	m := got.Months[0]
	if m.Month != "2015-08" || m.Aqua != 100 || m.SNPP != 400 || m.N20 != 0 || m.Harmonized != 410 {
		t.Errorf("2015-08 = %+v", m)
	}
	if got.Ratios.SNPPOverAqua == nil || *got.Ratios.SNPPOverAqua != 3.9 {
		t.Errorf("snpp/aqua = %v", got.Ratios.SNPPOverAqua)
	}
	if got.Ratios.N20OverSNPP == nil || *got.Ratios.N20OverSNPP != 1.03 {
		t.Errorf("n20/snpp = %v", got.Ratios.N20OverSNPP)
	}
}
