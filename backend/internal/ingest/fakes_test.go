package ingest

import (
	"context"
	"fmt"
	"io"
	"log/slog"
	"math"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/nasa-challenge/app/backend/internal/firms"
	"github.com/nasa-challenge/app/backend/internal/harmonize"
)

func discardLogger() *slog.Logger { return slog.New(slog.NewTextHandler(io.Discard, nil)) }

// fakeCountry describes a synthetic country: a box and how many Aqua
// detections it has per year. VIIRS sees four times more.
type fakeCountry struct {
	lat, lon float64 // south-west corner of a 1° box
	perYear  int
}

// fakeFIRMS serves a deterministic archive and area API.
type fakeFIRMS struct {
	mu        sync.Mutex
	countries map[string]fakeCountry
	lastYear  int
	updated   string
	calls     []string
	area      map[string][]harmonize.Detection // source -> detections
	avail     map[string]firms.DateRange
	usage     []int // successive current_transactions answers; the last one repeats
	statuses  int
}

func (f *fakeFIRMS) KeyStatus(context.Context) (firms.KeyStatus, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.statuses++
	if len(f.usage) == 0 {
		return firms.KeyStatus{Limit: 5000}, nil
	}
	cur := f.usage[0]
	if len(f.usage) > 1 {
		f.usage = f.usage[1:]
	}
	return firms.KeyStatus{Limit: 5000, Current: cur}, nil
}

var season = [12]float64{.3, .5, .9, .6, .4, .6, 1.6, 2.4, 1.5, .9, .5, .3}

func (f *fakeFIRMS) Index(context.Context) (firms.Index, error) {
	idx := firms.Index{}
	for name := range f.countries {
		for y := 2002; y <= f.lastYear; y++ {
			idx[firms.FileName(firms.ProductMODIS, y, name)] = firms.IndexEntry{Updated: f.updated}
			if y >= 2012 {
				idx[firms.FileName(firms.ProductSNPP, y, name)] = firms.IndexEntry{Updated: f.updated}
			}
			if y >= 2018 {
				idx[firms.FileName(firms.ProductNOAA20, y, name)] = firms.IndexEntry{Updated: f.updated}
			}
		}
	}
	return idx, nil
}

func (f *fakeFIRMS) CountryFile(_ context.Context, product string, year int, country string, fn func(harmonize.Detection) error) error {
	f.mu.Lock()
	f.calls = append(f.calls, firms.FileName(product, year, country))
	f.mu.Unlock()
	c := f.countries[country]
	n := c.perYear
	if product != firms.ProductMODIS {
		n *= 4
	}
	sat := map[string]harmonize.Satellite{firms.ProductMODIS: harmonize.Aqua, firms.ProductSNPP: harmonize.SNPP, firms.ProductNOAA20: harmonize.NOAA20}[product]
	var w float64
	for _, s := range season {
		w += s
	}
	i := 0
	for m := 1; m <= 12; m++ {
		if year == 2002 && m < 7 {
			continue
		}
		k := int(math.Round(float64(n) * season[m-1] / w))
		for j := 0; j < k; j++ {
			i++
			d := harmonize.Detection{
				Lat: c.lat + float64(i%4)*0.25 + 0.1, Lon: c.lon + float64((i/4)%4)*0.25 + 0.1,
				Date: fmt.Sprintf("%d-%02d-%02d", year, m, 1+j%28), Time: 1300, Satellite: sat,
				Confidence: "80", FRP: 10, DayNight: "DN"[j%2], HasType: true,
			}
			if sat != harmonize.Aqua {
				d.Confidence = "n"
			}
			if err := fn(d); err != nil {
				return err
			}
			if product == firms.ProductMODIS && j%3 == 0 { // Terra is in the same file and must be dropped
				d.Satellite = harmonize.Terra
				if err := fn(d); err != nil {
					return err
				}
			}
			if year >= 2023 && product != firms.ProductMODIS && j == 0 && m == 1 { // one static source
				d.Type, d.Lat, d.Lon = 2, 50.5, 3.5
				if err := fn(d); err != nil {
					return err
				}
			}
		}
	}
	return nil
}

func (f *fakeFIRMS) Availability(context.Context) (map[string]firms.DateRange, error) {
	return f.avail, nil
}

func (f *fakeFIRMS) AreaRange(_ context.Context, source, area string, from, to time.Time, fn func(harmonize.Detection) error) error {
	f.mu.Lock()
	f.calls = append(f.calls, fmt.Sprintf("%s %s %s..%s", source, area, from.Format(time.DateOnly), to.Format(time.DateOnly)))
	f.mu.Unlock()
	lo, hi := from.Format(time.DateOnly), to.Format(time.DateOnly)
	for _, d := range f.area[source] {
		if d.Date >= lo && d.Date <= hi {
			if err := fn(d); err != nil {
				return err
			}
		}
	}
	return nil
}

func (f *fakeFIRMS) callsMatching(prefix string) []string {
	f.mu.Lock()
	defer f.mu.Unlock()
	var out []string
	for _, c := range f.calls {
		if strings.HasPrefix(c, prefix) {
			out = append(out, c)
		}
	}
	return out
}

// fakeStore keeps everything in memory.
type fakeStore struct {
	mu        sync.Mutex
	regions   map[string]*RegionInfo
	results   map[string]harmonize.Result
	geo       map[string]RegionGeo
	errors    map[string]string
	files     map[string]string
	sensor    map[string]map[string]harmonize.Summary // region -> sensor -> summary
	fixed     map[[2]int32]bool
	state     map[string]string
	recent    map[string][]RecentRow // day -> rows
	recentDay map[string]RecentDay
}

func newFakeStore() *fakeStore {
	return &fakeStore{
		regions: map[string]*RegionInfo{}, results: map[string]harmonize.Result{}, geo: map[string]RegionGeo{},
		errors: map[string]string{}, files: map[string]string{}, sensor: map[string]map[string]harmonize.Summary{},
		fixed: map[[2]int32]bool{}, state: map[string]string{}, recent: map[string][]RecentRow{}, recentDay: map[string]RecentDay{},
	}
}

func (s *fakeStore) EnsureRegions(_ context.Context, ids []string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, id := range ids {
		if _, ok := s.regions[id]; !ok {
			s.regions[id] = &RegionInfo{ID: id, Status: StatusPending}
		}
	}
	return nil
}

func (s *fakeStore) IngestedFiles(context.Context) (map[string]string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := map[string]string{}
	for k, v := range s.files {
		out[k] = v
	}
	return out, nil
}

func (s *fakeStore) SaveFile(_ context.Context, f FileResult) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.sensor[f.Region] == nil {
		s.sensor[f.Region] = map[string]harmonize.Summary{}
	}
	sum := s.sensor[f.Region][f.Sensor]
	if sum == nil {
		sum = harmonize.Summary{}
		s.sensor[f.Region][f.Sensor] = sum
	}
	for k := range sum {
		if k.Month.Year() == f.Year {
			delete(sum, k)
		}
	}
	sum.Merge(f.Summary)
	for _, p := range f.Fixed {
		s.fixed[p] = true
	}
	s.files[f.Name] = f.Updated
	s.regions[f.Region].NeedsHarmonize = true
	return nil
}

func (s *fakeStore) LoadInput(_ context.Context, region string, archiveEnd harmonize.Month) (harmonize.Input, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	in := harmonize.Input{Name: region, ArchiveEnd: archiveEnd, Aqua: harmonize.Summary{}, SNPP: harmonize.Summary{}, N20: harmonize.Summary{}}
	in.Aqua.Merge(s.sensor[region][SensorAqua])
	in.SNPP.Merge(s.sensor[region][SensorSNPP])
	in.N20.Merge(s.sensor[region][SensorN20])
	return in, nil
}

func (s *fakeStore) SaveResult(_ context.Context, region string, res harmonize.Result, geo RegionGeo) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.results[region], s.geo[region] = res, geo
	r := s.regions[region]
	r.Status, r.Scope, r.NeedsHarmonize = string(res.Status), string(res.Scope), false
	r.TrainHotspots, r.ExamHotspots = res.TrainHotspots, res.ExamHotspots
	lat, lon := geo.CentroidLat, geo.CentroidLon
	r.CentroidLat, r.CentroidLon = &lat, &lon
	delete(s.errors, region)
	return nil
}

func (s *fakeStore) SaveError(_ context.Context, region, reason string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.errors[region] = reason
	s.regions[region].Status = StatusError
	return nil
}

func (s *fakeStore) Regions(context.Context) ([]RegionInfo, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := make([]RegionInfo, 0, len(s.regions))
	for _, r := range s.regions {
		out = append(out, *r)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].ID < out[j].ID })
	return out, nil
}

func (s *fakeStore) SetState(_ context.Context, key, value string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.state[key] = value
	return nil
}

func (s *fakeStore) FixedSources(context.Context) (*harmonize.FixedSources, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	m := harmonize.NewFixedSources()
	for p := range s.fixed {
		m.Add(float64(p[0])/100, float64(p[1])/100)
	}
	return m, nil
}

func (s *fakeStore) RecentDays(context.Context) (map[string]RecentDay, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := map[string]RecentDay{}
	for k, v := range s.recentDay {
		out[k] = v
	}
	return out, nil
}

func (s *fakeStore) SaveRecent(_ context.Context, w RecentWindow) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, d := range w.Days {
		delete(s.recent, d)
		s.recentDay[d] = RecentDay{Source: w.Source, Final: w.Final, Detections: w.Detections[d]}
	}
	for _, r := range w.Rows {
		s.recent[r.Day] = append(s.recent[r.Day], r)
	}
	return nil
}
