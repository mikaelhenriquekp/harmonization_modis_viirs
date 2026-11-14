package ingest

import (
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/nasa-challenge/app/backend/internal/firms"
	"github.com/nasa-challenge/app/backend/internal/harmonize"
)

func date(s string) time.Time {
	d, err := time.Parse(time.DateOnly, s)
	if err != nil {
		panic(err)
	}
	return d
}

func newFake() *fakeFIRMS {
	return &fakeFIRMS{
		countries: map[string]fakeCountry{
			"Fuegolandia": {lat: 38, lon: -2, perYear: 1200},
			"Islote":      {lat: 39, lon: 1, perYear: 6}, // ~150 km away, too little fire
			"Lejania":     {lat: -40, lon: 170, perYear: 6},
		},
		lastYear: 2025, updated: "2025-06-01 10:00:00",
		avail: map[string]firms.DateRange{
			"VIIRS_SNPP_SP":    {Min: date("2012-01-20"), Max: date("2026-07-31")},
			"VIIRS_SNPP_NRT":   {Min: date("2026-08-01"), Max: date("2026-11-02")},
			"VIIRS_NOAA20_SP":  {Min: date("2018-04-01"), Max: date("2026-07-31")},
			"VIIRS_NOAA20_NRT": {Min: date("2026-08-01"), Max: date("2026-11-14")},
		},
		area: map[string][]harmonize.Detection{},
	}
}

func newService(src Source, store Store, cfg Config) *Service {
	if cfg.Now == nil {
		cfg.Now = func() time.Time { return date("2026-11-14") }
	}
	cfg.SkipRecent = cfg.SkipRecent || src.(*fakeFIRMS).area == nil
	return NewService(src, store, cfg, discardLogger())
}

func TestArchiveIngestHarmonizesEveryCountry(t *testing.T) {
	src, store := newFake(), newFakeStore()
	svc := newService(src, store, Config{Workers: 2, SkipRecent: true})
	if err := svc.Run(t.Context()); err != nil {
		t.Fatal(err)
	}

	big := store.results["Fuegolandia"]
	if big.Status != harmonize.StatusOK || big.Scope != harmonize.ScopeOwn {
		t.Fatalf("Fuegolandia = %s/%s", big.Status, big.Scope)
	}
	if big.Series[0].Month != harmonize.MustMonth("2002-07") || big.Series[len(big.Series)-1].Month != harmonize.MustMonth("2025-12") {
		t.Errorf("series %s..%s", big.Series[0].Month, big.Series[len(big.Series)-1].Month)
	}
	if store.state[StateArchiveEnd] != "2025-12" {
		t.Errorf("archive_end = %q", store.state[StateArchiveEnd])
	}
	g := store.geo["Fuegolandia"]
	if g.BBox.LatMin != 38 || g.BBox.LatMax != 39 || g.CentroidLat < 38 || g.CentroidLat > 39 {
		t.Errorf("geo = %+v", g)
	}

	// Terra is dropped: the Aqua summary has exactly the Aqua detections.
	if got := store.sensor["Fuegolandia"][SensorAqua].Between(harmonize.NewMonth(2010, 1), harmonize.NewMonth(2010, 12)); got < 1190 || got > 1210 {
		t.Errorf("Aqua 2010 = %v, want ~1200", got)
	}

	small := store.results["Islote"]
	if small.Status != harmonize.StatusOK || small.Scope != harmonize.ScopeRegional || !slices.Equal(small.PooledWith, []string{"Fuegolandia"}) {
		t.Errorf("Islote = %s/%s/%v", small.Status, small.Scope, small.PooledWith)
	}
	far := store.results["Lejania"]
	if far.Status != harmonize.StatusInsufficient {
		t.Errorf("Lejania (no neighbor within reach) = %s", far.Status)
	}
	if len(store.fixed) == 0 {
		t.Error("static sources from the 2023+ VIIRS archive were not stored")
	}
}

func TestArchiveIngestResumesWithoutDownloadingAgain(t *testing.T) {
	src, store := newFake(), newFakeStore()
	svc := newService(src, store, Config{Workers: 1, SkipRecent: true})
	if err := svc.Run(t.Context()); err != nil {
		t.Fatal(err)
	}
	first := len(src.callsMatching("modis_"))
	if err := svc.Run(t.Context()); err != nil {
		t.Fatal(err)
	}
	if again := len(src.callsMatching("modis_")); again != first {
		t.Errorf("second run downloaded %d MODIS files again", again-first)
	}

	src.updated = "2026-01-01 00:00:00" // FIRMS republished everything
	if err := svc.Run(t.Context()); err != nil {
		t.Fatal(err)
	}
	if again := len(src.callsMatching("modis_")); again != 2*first {
		t.Errorf("updated files were not downloaded again: %d, want %d", again, 2*first)
	}
}

func TestOnlyRequestedCountriesInPriorityOrder(t *testing.T) {
	src, store := newFake(), newFakeStore()
	svc := newService(src, store, Config{Workers: 1, Countries: []string{"Islote", "Fuegolandia"}, Priority: []string{"Islote"}, SkipRecent: true})
	if err := svc.Run(t.Context()); err != nil {
		t.Fatal(err)
	}
	calls := src.callsMatching("modis_2002")
	if len(calls) != 2 || calls[0] != "modis_2002_Islote.csv" {
		t.Errorf("calls = %v", calls)
	}
	if _, ok := store.regions["Lejania"]; ok {
		t.Error("Lejania was not requested")
	}
}

func TestRecentSourcePerDay(t *testing.T) {
	av := newFake().avail
	tests := []struct {
		day    string
		source string
		final  bool
	}{
		{"2026-01-01", "VIIRS_SNPP_SP", true},
		{"2026-07-31", "VIIRS_SNPP_SP", true},
		{"2026-08-01", "VIIRS_SNPP_NRT", false},
		{"2026-11-01", "VIIRS_SNPP_NRT", false}, // last day of Suomi NPP
		{"2026-11-02", "VIIRS_NOAA20_NRT", false},
		{"2026-11-14", "VIIRS_NOAA20_NRT", false},
	}
	for _, tt := range tests {
		src, final, ok := SourceForDay(date(tt.day), av)
		if !ok || src != tt.source || final != tt.final {
			t.Errorf("%s: %s final=%v ok=%v, want %s final=%v", tt.day, src, final, ok, tt.source, tt.final)
		}
	}
	if _, _, ok := SourceForDay(date("2026-11-20"), av); ok {
		t.Error("day after every source should not be available")
	}
}

func TestRecentIngestFetchesTheWorldAndRefreshesNRT(t *testing.T) {
	src, store := newFake(), newFakeStore()
	store.state[StateArchiveEnd] = "2025-12"
	store.fixed[[2]int32{5050, 350}] = true
	det := func(date string, sat harmonize.Satellite, lat float64, typed bool) harmonize.Detection {
		return harmonize.Detection{Lat: lat, Lon: -1.1, Date: date, Time: 1300, Satellite: sat, Confidence: "n", FRP: 2, DayNight: 'D', HasType: typed}
	}
	src.area["VIIRS_SNPP_SP"] = []harmonize.Detection{det("2026-01-03", harmonize.SNPP, 38.1, true), det("2026-01-03", harmonize.NOAA20, 38.1, true)}
	src.area["VIIRS_SNPP_NRT"] = []harmonize.Detection{det("2026-10-30", harmonize.SNPP, 38.1, false)}
	nrtN20 := det("2026-11-13", harmonize.NOAA20, 38.1, false)
	onFixed := nrtN20
	onFixed.Lat, onFixed.Lon = 50.5, 3.5
	src.area["VIIRS_NOAA20_NRT"] = []harmonize.Detection{nrtN20, onFixed}

	svc := newService(src, store, Config{RecentDays: 7})
	if err := svc.Recent(t.Context(), harmonize.MustMonth("2025-12")); err != nil {
		t.Fatal(err)
	}
	if rows := store.recent["2026-01-03"]; len(rows) != 1 || rows[0].Hotspots != 1 || rows[0].Provisional {
		t.Errorf("2026-01-03 = %+v (NOAA-20 rows must not enter a Suomi NPP day)", rows)
	}
	if rows := store.recent["2026-11-13"]; len(rows) != 1 || !rows[0].Provisional {
		t.Errorf("2026-11-13 = %+v (the static source must be masked)", rows)
	}
	if d := store.recentDay["2026-01-03"]; !d.Final || d.Source != "VIIRS_SNPP_SP" {
		t.Errorf("recent day = %+v", d)
	}
	for _, c := range src.callsMatching("VIIRS") {
		if !strings.Contains(c, " world ") {
			t.Errorf("call %q is not for the world", c)
		}
	}

	// Second run: final days are skipped, NRT days within RecentDays are fetched again.
	before := len(src.calls)
	if err := svc.Recent(t.Context(), harmonize.MustMonth("2025-12")); err != nil {
		t.Fatal(err)
	}
	again := src.calls[before:]
	if len(again) == 0 || len(again) > 3 {
		t.Errorf("second run calls = %v", again)
	}
	for _, c := range again {
		if !strings.Contains(c, "NRT") {
			t.Errorf("second run fetched a final source: %s", c)
		}
	}
}

func TestHaversine(t *testing.T) {
	if d := haversineKm(0, 0, 0, 1); d < 110 || d > 112 {
		t.Errorf("1° at the equator = %v km", d)
	}
}

func TestRecentWaitsWhenTheKeyIsBusy(t *testing.T) {
	src, store := newFake(), newFakeStore()
	src.avail = map[string]firms.DateRange{"VIIRS_NOAA20_NRT": {Min: date("2026-11-10"), Max: date("2026-11-14")}}
	src.usage = []int{4900, 4200, 100}
	svc := newService(src, store, Config{TxBudget: 3000, PaceWait: time.Millisecond})
	if err := svc.Recent(t.Context(), harmonize.MustMonth("2026-10")); err != nil {
		t.Fatal(err)
	}
	if src.statuses < 3 {
		t.Errorf("checked the key %d times, want at least 3 (wait until under budget)", src.statuses)
	}
	if len(src.callsMatching("VIIRS")) != 1 {
		t.Errorf("calls = %v", src.callsMatching("VIIRS"))
	}
}

func TestRunRecordsItsProgress(t *testing.T) {
	src, store := newFake(), newFakeStore()
	svc := newService(src, store, Config{Workers: 1, SkipRecent: true, Now: func() time.Time { return date("2026-11-14") }})
	if err := svc.Run(t.Context()); err != nil {
		t.Fatal(err)
	}
	if store.state[StatePhase] != PhaseIdle || store.state[StateStartedAt] == "" || store.state[StateFinishedAt] == "" || store.state[StateLastError] != "" {
		t.Errorf("state = %v", store.state)
	}
}

func TestRunRecordsItsError(t *testing.T) {
	src, store := newFake(), newFakeStore()
	src.avail = nil
	src.area = map[string][]harmonize.Detection{}
	src.availErr = errBoom
	svc := newService(src, store, Config{Workers: 1})
	if err := svc.Run(t.Context()); err == nil {
		t.Fatal("want error")
	}
	if !strings.Contains(store.state[StateLastError], "boom") || store.state[StatePhase] != PhaseIdle {
		t.Errorf("state = %v", store.state)
	}
}
