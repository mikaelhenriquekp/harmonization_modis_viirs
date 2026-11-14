package hotspots

import (
	"context"
	"errors"
	"fmt"
	"net/url"
	"sort"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/nasa-challenge/app/backend/internal/firms"
	"github.com/nasa-challenge/app/backend/internal/geo"
	"github.com/nasa-challenge/app/backend/internal/harmonize"
)

type fakeFIRMS struct {
	mu    sync.Mutex
	calls []string
	err   error
}

func (f *fakeFIRMS) Availability(context.Context) (map[string]firms.DateRange, error) {
	return map[string]firms.DateRange{
		"MODIS_SP":         {Min: day("2000-11-01"), Max: day("2026-08-31")},
		"VIIRS_SNPP_SP":    {Min: day("2012-01-20"), Max: day("2026-07-31")},
		"VIIRS_SNPP_NRT":   {Min: day("2026-08-01"), Max: day("2026-11-02")},
		"VIIRS_NOAA20_NRT": {Min: day("2026-08-01"), Max: day("2026-11-14")},
	}, nil
}

func (f *fakeFIRMS) AreaRange(_ context.Context, source, area string, from, to time.Time, fn func(harmonize.Detection) error) error {
	f.mu.Lock()
	f.calls = append(f.calls, fmt.Sprintf("%s %s %s %s", source, area, from.Format(time.DateOnly), to.Format(time.DateOnly)))
	f.mu.Unlock()
	if f.err != nil {
		return f.err
	}
	sat := map[string]harmonize.Satellite{"MODIS_SP": harmonize.Aqua, "VIIRS_SNPP_SP": harmonize.SNPP, "VIIRS_SNPP_NRT": harmonize.SNPP, "VIIRS_NOAA20_NRT": harmonize.NOAA20}[source]
	conf := "n"
	if sat == harmonize.Aqua {
		conf = "80"
	}
	for d := from; !d.After(to); d = d.AddDate(0, 0, 1) {
		base := harmonize.Detection{Lat: 38.1, Lon: -1.1, Date: d.Format(time.DateOnly), Time: 1300, Satellite: sat, Confidence: conf, FRP: 3, DayNight: 'D', HasType: strings.HasSuffix(source, "_SP")}
		if err := fn(base); err != nil {
			return err
		}
		other := base
		other.Satellite = harmonize.Terra // dropped unless all=true
		other.Lat = 50                    // outside small boxes
		if err := fn(other); err != nil {
			return err
		}
	}
	return nil
}

func day(s string) time.Time {
	d, err := time.Parse(time.DateOnly, s)
	if err != nil {
		panic(err)
	}
	return d
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

func TestFetchPicksTheSourceOfEveryDay(t *testing.T) {
	f := &fakeFIRMS{}
	svc := NewService(f)
	rows, err := svc.Fetch(t.Context(), Query{Area: area(t, "bbox=-2,37,-1,39"), From: day("2012-01-30"), To: day("2012-02-02")})
	if err != nil {
		t.Fatal(err)
	}
	sort.Strings(f.calls)
	want := []string{"MODIS_SP -2,37,-1,39 2012-01-30 2012-01-31", "VIIRS_SNPP_SP -2,37,-1,39 2012-02-01 2012-02-02"}
	if fmt.Sprint(f.calls) != fmt.Sprint(want) {
		t.Errorf("calls = %v\nwant %v", f.calls, want)
	}
	if len(rows) != 4 || rows[0].Date != "2012-01-30" || rows[0].Source != "MODIS_SP" || rows[3].Source != "VIIRS_SNPP_SP" {
		t.Errorf("rows = %+v", rows)
	}
}

func TestFetchSplitsLongRangesAndKeepsOrder(t *testing.T) {
	f := &fakeFIRMS{}
	rows, err := NewService(f).Fetch(t.Context(), Query{Area: area(t, "bbox=-2,37,-1,39"), From: day("2026-10-20"), To: day("2026-11-14")})
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) != 26 {
		t.Fatalf("rows = %d, want one per day", len(rows))
	}
	for i := 1; i < len(rows); i++ {
		if rows[i].Date < rows[i-1].Date {
			t.Fatalf("rows out of order at %d", i)
		}
	}
	if rows[12].Source != "VIIRS_SNPP_NRT" || rows[13].Source != "VIIRS_NOAA20_NRT" || !rows[13].Provisional() {
		t.Errorf("handover = %+v / %+v", rows[12], rows[13])
	}
	for _, c := range f.calls {
		parts := strings.Fields(c)
		if d := day(parts[3]).Sub(day(parts[2])).Hours()/24 + 1; d > firms.MaxDays {
			t.Errorf("window %s is longer than %d days", c, firms.MaxDays)
		}
	}
}

func TestFetchAllKeepsEveryDetection(t *testing.T) {
	rows, err := NewService(&fakeFIRMS{}).Fetch(t.Context(), Query{Area: area(t, ""), From: day("2020-01-01"), To: day("2020-01-01"), All: true})
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) != 2 {
		t.Errorf("rows = %d, want 2 (Terra kept with all)", len(rows))
	}
}

func TestFetchAcrossTheAntimeridian(t *testing.T) {
	f := &fakeFIRMS{}
	if _, err := NewService(f).Fetch(t.Context(), Query{Area: area(t, "bbox=170,-45,-170,-30"), From: day("2020-01-01"), To: day("2020-01-01")}); err != nil {
		t.Fatal(err)
	}
	sort.Strings(f.calls)
	want := "[VIIRS_SNPP_SP -180,-45,-170,-30 2020-01-01 2020-01-01 VIIRS_SNPP_SP 170,-45,180,-30 2020-01-01 2020-01-01]"
	if fmt.Sprint(f.calls) != want {
		t.Errorf("calls = %v", f.calls)
	}
}

func TestValidate(t *testing.T) {
	svc := NewService(&fakeFIRMS{})
	tests := []struct {
		name string
		q    Query
		ok   bool
	}{
		{"a year", Query{Area: area(t, "bbox=-2,37,-1,39"), From: day("2020-01-01"), To: day("2020-12-31")}, true},
		{"too long", Query{Area: area(t, "bbox=-2,37,-1,39"), From: day("2019-01-01"), To: day("2020-12-31")}, false},
		{"world a week", Query{Area: area(t, ""), From: day("2020-01-01"), To: day("2020-01-07")}, true},
		{"world a month", Query{Area: area(t, ""), From: day("2020-01-01"), To: day("2020-01-31")}, false},
		{"before the record", Query{Area: area(t, ""), From: day("2001-01-01"), To: day("2001-01-02")}, false},
		{"reversed", Query{Area: area(t, ""), From: day("2020-01-02"), To: day("2020-01-01")}, false},
	}
	for _, tt := range tests {
		if err := svc.Validate(tt.q); (err == nil) != tt.ok {
			t.Errorf("%s: err = %v", tt.name, err)
		}
	}
}

func TestFetchSurfacesFIRMSErrors(t *testing.T) {
	_, err := NewService(&fakeFIRMS{err: firms.ErrLimit}).Fetch(t.Context(), Query{Area: area(t, ""), From: day("2020-01-01"), To: day("2020-01-01")})
	if !errors.Is(err, firms.ErrLimit) {
		t.Errorf("err = %v", err)
	}
}
