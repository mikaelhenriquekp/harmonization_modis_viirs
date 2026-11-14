package firms

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/nasa-challenge/app/backend/internal/harmonize"
)

// Rows copied from real FIRMS files (archive by country, area API, NRT).
const (
	modisCSV = `latitude,longitude,brightness,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_t31,frp,daynight,type
38.8406,22.4815,302.7,1.1,1,2020-01-02,0934,Terra,MODIS,53,6.03,279.8,9,D,0
39.7982,21.5199,303.6,1.8,1.3,2020-01-02,1113,Aqua,MODIS,57,6.03,282,21.5,D,0
`
	viirsCSV = `latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight,type
38.03911,-1.00956,306.62,0.39,0.36,2025-08-01,155,N,VIIRS,n,2,291.06,0.45,N,0
38.56419,23.29666,297.42,0.56,0.43,2020-01-01,0043,N,VIIRS,l,2,276.37,1.03,N,2
`
	nrtCSV = `latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight
59.77688,44.1914,299.52,0.45,0.39,2026-11-10,0,N20,VIIRS,n,2.0NRT,271.88,1.31,N
`
)

func TestParseCSV(t *testing.T) {
	tests := []struct {
		name string
		in   string
		want []harmonize.Detection
	}{
		{"modis archive", modisCSV, []harmonize.Detection{
			{Lat: 38.8406, Lon: 22.4815, Date: "2020-01-02", Time: 934, Satellite: harmonize.Terra, Confidence: "53", FRP: 9, Scan: 1.1, Track: 1, DayNight: 'D', Type: 0, HasType: true},
			{Lat: 39.7982, Lon: 21.5199, Date: "2020-01-02", Time: 1113, Satellite: harmonize.Aqua, Confidence: "57", FRP: 21.5, Scan: 1.8, Track: 1.3, DayNight: 'D', Type: 0, HasType: true},
		}},
		{"viirs archive", viirsCSV, []harmonize.Detection{
			{Lat: 38.03911, Lon: -1.00956, Date: "2025-08-01", Time: 155, Satellite: harmonize.SNPP, Confidence: "n", FRP: 0.45, Scan: 0.39, Track: 0.36, DayNight: 'N', Type: 0, HasType: true},
			{Lat: 38.56419, Lon: 23.29666, Date: "2020-01-01", Time: 43, Satellite: harmonize.SNPP, Confidence: "l", FRP: 1.03, Scan: 0.56, Track: 0.43, DayNight: 'N', Type: 2, HasType: true},
		}},
		{"near real time has no type", nrtCSV, []harmonize.Detection{
			{Lat: 59.77688, Lon: 44.1914, Date: "2026-11-10", Time: 0, Satellite: harmonize.NOAA20, Confidence: "n", FRP: 1.31, Scan: 0.45, Track: 0.39, DayNight: 'N'},
		}},
		{"empty answer", "latitude,longitude,acq_date,acq_time,satellite,confidence,frp,daynight\n", nil},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var got []harmonize.Detection
			err := ParseCSV(strings.NewReader(tt.in), func(d harmonize.Detection) error { got = append(got, d); return nil })
			if err != nil {
				t.Fatal(err)
			}
			if fmt.Sprint(got) != fmt.Sprint(tt.want) {
				t.Errorf("got  %+v\nwant %+v", got, tt.want)
			}
		})
	}
}

func TestParseCSVRejectsAPIMessages(t *testing.T) {
	for _, body := range []string{"Invalid MAP_KEY.", "Invalid day range. Expects [1..5].", ""} {
		err := ParseCSV(strings.NewReader(body), func(harmonize.Detection) error { return nil })
		if !errors.Is(err, ErrAPI) {
			t.Errorf("ParseCSV(%q) err = %v, want ErrAPI", body, err)
		}
	}
}

func TestParseIndex(t *testing.T) {
	idx, err := ParseIndex(strings.NewReader(`filename,size,updated
AttributesReadme.txt,3178,2025-06-23 13:53:50
modis_2000_Afghanistan.csv,587,2023-12-14 11:15:07
modis_2021_South_Africa.csv,1000,2023-12-14 11:15:07
viirs-snpp_2021_South_Africa.csv,9000,2023-12-14 11:15:07
viirs-jpss1_2024_Spain.csv,9000,2025-02-01 10:00:00
`))
	if err != nil {
		t.Fatal(err)
	}
	if e := idx["viirs-jpss1_2024_Spain.csv"]; e.Size != 9000 || e.Updated != "2025-02-01 10:00:00" {
		t.Errorf("entry = %+v", e)
	}
	if got := idx.Countries(); fmt.Sprint(got) != "[Afghanistan South_Africa]" {
		t.Errorf("Countries = %v", got)
	}
	if got := idx.LastYear(); got != 2024 {
		t.Errorf("LastYear = %d", got)
	}
	if !idx.Has(ProductSNPP, 2021, "South_Africa") || idx.Has(ProductSNPP, 2021, "Spain") {
		t.Error("Has is wrong")
	}
}

func TestWindows(t *testing.T) {
	got := Windows(day("2026-01-01"), day("2026-01-12"))
	want := "[{2026-01-01 5} {2026-01-06 5} {2026-01-11 2}]"
	if fmt.Sprint(got) != want {
		t.Errorf("Windows = %v, want %v", got, want)
	}
	if Windows(day("2026-01-02"), day("2026-01-01")) != nil {
		t.Error("empty range should give no windows")
	}
}

func day(s string) time.Time {
	d, err := time.Parse(time.DateOnly, s)
	if err != nil {
		panic(err)
	}
	return d
}

func newTestClient(t *testing.T, h http.HandlerFunc) *Client {
	t.Helper()
	srv := httptest.NewServer(h)
	t.Cleanup(srv.Close)
	c := NewClient("KEY")
	c.BaseURL = srv.URL
	c.RetryWait = time.Millisecond
	return c
}

func TestCountryFile(t *testing.T) {
	c := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/data/country/modis/2020/modis_2020_Greece.csv":
			fmt.Fprint(w, modisCSV)
		default:
			http.NotFound(w, r)
		}
	})
	n := 0
	err := c.CountryFile(t.Context(), ProductMODIS, 2020, "Greece", func(harmonize.Detection) error { n++; return nil })
	if err != nil || n != 2 {
		t.Fatalf("n=%d err=%v", n, err)
	}
	err = c.CountryFile(t.Context(), ProductSNPP, 2020, "Greece", func(harmonize.Detection) error { return nil })
	if !errors.Is(err, ErrNotFound) {
		t.Errorf("err = %v, want ErrNotFound", err)
	}
}

func TestAreaRangeSplitsWindowsAndCropsDates(t *testing.T) {
	var paths []string
	c := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		paths = append(paths, r.URL.Path)
		fmt.Fprint(w, viirsCSV) // dates 2025-08-01 and 2020-01-01: only the first is in range
	})
	var got []harmonize.Detection
	err := c.AreaRange(t.Context(), "VIIRS_SNPP_SP", "-2.35,37.37,-0.65,38.76", day("2025-07-30"), day("2025-08-05"),
		func(d harmonize.Detection) error { got = append(got, d); return nil })
	if err != nil {
		t.Fatal(err)
	}
	want := []string{
		"/api/area/csv/KEY/VIIRS_SNPP_SP/-2.35,37.37,-0.65,38.76/5/2025-07-30",
		"/api/area/csv/KEY/VIIRS_SNPP_SP/-2.35,37.37,-0.65,38.76/2/2025-08-04",
	}
	if fmt.Sprint(paths) != fmt.Sprint(want) {
		t.Errorf("paths = %v\nwant %v", paths, want)
	}
	if len(got) != 2 { // one in-range row per window
		t.Errorf("got %d detections, want 2", len(got))
	}
}

func TestAreaSurfacesAPIErrors(t *testing.T) {
	c := newTestClient(t, func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusBadRequest)
		fmt.Fprint(w, "Invalid MAP_KEY.")
	})
	err := c.AreaRange(t.Context(), "VIIRS_SNPP_SP", "world", day("2025-08-01"), day("2025-08-01"), func(harmonize.Detection) error { return nil })
	if !errors.Is(err, ErrAPI) || !strings.Contains(err.Error(), "Invalid MAP_KEY") {
		t.Errorf("err = %v", err)
	}
}

func TestRetriesServerErrors(t *testing.T) {
	var calls atomic.Int32
	c := newTestClient(t, func(w http.ResponseWriter, _ *http.Request) {
		if calls.Add(1) < 3 {
			w.WriteHeader(http.StatusBadGateway)
			return
		}
		fmt.Fprint(w, modisCSV)
	})
	n := 0
	if err := c.CountryFile(t.Context(), ProductMODIS, 2020, "Greece", func(harmonize.Detection) error { n++; return nil }); err != nil {
		t.Fatal(err)
	}
	if n != 2 || calls.Load() != 3 {
		t.Errorf("n=%d calls=%d", n, calls.Load())
	}
}

func TestAvailability(t *testing.T) {
	c := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/data_availability/csv/KEY/all" {
			http.NotFound(w, r)
			return
		}
		fmt.Fprint(w, "data_id,min_date,max_date\nVIIRS_SNPP_SP,2012-01-20,2026-07-31\nVIIRS_SNPP_NRT,2026-08-01,2026-11-02\n")
	})
	got, err := c.Availability(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if r := got["VIIRS_SNPP_SP"]; !r.Max.Equal(day("2026-07-31")) || !r.Min.Equal(day("2012-01-20")) {
		t.Errorf("availability = %+v", got)
	}
}

func TestWaitsOutTheTransactionLimit(t *testing.T) {
	var calls atomic.Int32
	c := newTestClient(t, func(w http.ResponseWriter, _ *http.Request) {
		if calls.Add(1) < 3 {
			w.WriteHeader(http.StatusBadRequest)
			fmt.Fprint(w, "Exceeding allowed transaction limit.")
			return
		}
		fmt.Fprint(w, viirsCSV)
	})
	c.LimitWait = time.Millisecond
	n := 0
	err := c.Area(t.Context(), "VIIRS_SNPP_SP", "world", Window{Start: day("2025-08-01"), Days: 1}, func(harmonize.Detection) error { n++; return nil })
	if err != nil || n != 2 || calls.Load() != 3 {
		t.Errorf("n=%d calls=%d err=%v", n, calls.Load(), err)
	}

	c.LimitRetries = 1
	calls.Store(0)
	err = c.Area(t.Context(), "VIIRS_SNPP_SP", "world", Window{Start: day("2025-08-01"), Days: 1}, func(harmonize.Detection) error { return nil })
	if !errors.Is(err, ErrLimit) {
		t.Errorf("err = %v, want ErrLimit", err)
	}
}

func TestKeyStatus(t *testing.T) {
	c := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/mapserver/mapkey_status/" || r.URL.Query().Get("MAP_KEY") != "KEY" {
			http.NotFound(w, r)
			return
		}
		fmt.Fprint(w, `{ "transaction_limit" : 5000, "current_transactions": 4865, "transaction_interval" : "10 minutes" }`)
	})
	got, err := c.KeyStatus(t.Context())
	if err != nil || got.Limit != 5000 || got.Current != 4865 {
		t.Errorf("got %+v, %v", got, err)
	}
}
