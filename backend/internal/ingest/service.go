// Package ingest downloads NASA FIRMS hotspots, harmonizes them per country
// and keeps the recent days of VIIRS up to date. It runs as its own command
// (cmd/ingest), apart from the HTTP API.
package ingest

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"math"
	"sort"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/nasa-challenge/app/backend/internal/firms"
	"github.com/nasa-challenge/app/backend/internal/harmonize"
)

// Region statuses besides the harmonize ones.
const (
	StatusPending = "pending"
	StatusError   = "error"
)

// Sensors stored in sensor_cell_months.
const (
	SensorAqua = "aqua"
	SensorSNPP = "snpp"
	SensorN20  = "n20"
)

// StateArchiveEnd is the ingest_state key with the last archive month.
const StateArchiveEnd = "archive_end"

// Recent data sources of the area API.
const (
	SourceSNPPSP  = "VIIRS_SNPP_SP"
	SourceSNPPNRT = "VIIRS_SNPP_NRT"
	SourceN20SP   = "VIIRS_NOAA20_SP"
	SourceN20NRT  = "VIIRS_NOAA20_NRT"
)

// LastSNPPDay is the last day Suomi NPP delivered data; NOAA-20 takes over the
// next day.
var LastSNPPDay = time.Date(2026, 11, 1, 0, 0, 0, 0, time.UTC)

// lastSNPPArchiveMonth caps the archive part of the series: after it the
// yearly files would mix in months without Suomi NPP.
var lastSNPPArchiveMonth = harmonize.MustMonth("2026-10")

// Source is what the service needs from FIRMS.
type Source interface {
	Index(ctx context.Context) (firms.Index, error)
	CountryFile(ctx context.Context, product string, year int, country string, fn func(harmonize.Detection) error) error
	Availability(ctx context.Context) (map[string]firms.DateRange, error)
	AreaRange(ctx context.Context, source, area string, from, to time.Time, fn func(harmonize.Detection) error) error
}

// FileResult is one ingested archive file, summarized.
type FileResult struct {
	Name       string
	Updated    string
	Region     string
	Sensor     string
	Year       int
	Summary    harmonize.Summary
	Fixed      [][2]int32 // static source positions in 0.01°
	Detections int
}

// RegionGeo describes where a region's fire is.
type RegionGeo struct {
	BBox                     harmonize.BBox
	CentroidLat, CentroidLon float64
	FirstMonth, LastMonth    harmonize.Month
}

// RegionInfo is what the service reads back about a region.
type RegionInfo struct {
	ID             string
	Status         string
	Scope          string
	NeedsHarmonize bool
	TrainHotspots  int
	ExamHotspots   int
	CentroidLat    *float64
	CentroidLon    *float64
}

// RecentDay records how a recent day was fetched.
type RecentDay struct {
	Source     string
	Final      bool
	Detections int
}

// RecentRow is one cell and day of recent VIIRS.
type RecentRow struct {
	Day         string
	Cell        harmonize.Cell
	Hotspots    float64
	FRP         float64
	Provisional bool
}

// RecentWindow replaces the rows of a set of days.
type RecentWindow struct {
	Days       []string
	Source     string
	Final      bool
	Rows       []RecentRow
	Detections map[string]int
}

// Store is the persistence the service depends on.
type Store interface {
	EnsureRegions(ctx context.Context, ids []string) error
	IngestedFiles(ctx context.Context) (map[string]string, error)
	SaveFile(ctx context.Context, f FileResult) error
	LoadInput(ctx context.Context, region string, archiveEnd harmonize.Month) (harmonize.Input, error)
	SaveResult(ctx context.Context, region string, res harmonize.Result, geo RegionGeo) error
	SaveError(ctx context.Context, region, reason string) error
	Regions(ctx context.Context) ([]RegionInfo, error)
	SetState(ctx context.Context, key, value string) error
	FixedSources(ctx context.Context) (*harmonize.FixedSources, error)
	RecentDays(ctx context.Context) (map[string]RecentDay, error)
	SaveRecent(ctx context.Context, w RecentWindow) error
}

// Config tunes a run.
type Config struct {
	Countries  []string // only these (FIRMS spelling); empty means all
	Priority   []string // processed first, in this order
	Workers    int
	RecentDays int // near real time days fetched again on every run
	SkipRecent bool
	Now        func() time.Time
}

// Pooling limits for countries with too little fire.
const (
	MaxNeighborKm = 1500
	MaxNeighbors  = 3
)

// Service runs the ingest.
type Service struct {
	src   Source
	store Store
	cfg   Config
	log   *slog.Logger
}

// NewService builds a Service.
func NewService(src Source, store Store, cfg Config, log *slog.Logger) *Service {
	if cfg.Workers < 1 {
		cfg.Workers = 1
	}
	if cfg.RecentDays < 1 {
		cfg.RecentDays = 7
	}
	if cfg.Now == nil {
		cfg.Now = time.Now
	}
	return &Service{src: src, store: store, cfg: cfg, log: log}
}

type product struct {
	name      string
	sensor    string
	satellite harmonize.Satellite
	firstYear int
}

var products = []product{
	{firms.ProductMODIS, SensorAqua, harmonize.Aqua, 2002},
	{firms.ProductSNPP, SensorSNPP, harmonize.SNPP, 2012},
	{firms.ProductNOAA20, SensorN20, harmonize.NOAA20, 2018},
}

// ArchiveEnd is the last month the yearly archive covers with Suomi NPP.
func ArchiveEnd(lastYear int) harmonize.Month {
	return min(harmonize.NewMonth(lastYear, 12), lastSNPPArchiveMonth)
}

// Run ingests the archive, harmonizes every changed country, pools the small
// ones and updates the recent days.
func (s *Service) Run(ctx context.Context) error {
	idx, err := s.src.Index(ctx)
	if err != nil {
		return fmt.Errorf("read archive index: %w", err)
	}
	countries := s.order(idx.Countries())
	if err := s.store.EnsureRegions(ctx, countries); err != nil {
		return err
	}
	archiveEnd := ArchiveEnd(idx.LastYear())
	if err := s.store.SetState(ctx, StateArchiveEnd, archiveEnd.String()); err != nil {
		return err
	}
	done, err := s.store.IngestedFiles(ctx)
	if err != nil {
		return err
	}
	s.log.InfoContext(ctx, "ingest: archive", "countries", len(countries), "archive_end", archiveEnd.String())

	jobs := make(chan string)
	var wg sync.WaitGroup
	var changed atomic.Int32
	for range s.cfg.Workers {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for c := range jobs {
				did, err := s.country(ctx, idx, done, c, archiveEnd)
				if did {
					changed.Add(1)
				}
				if err != nil && ctx.Err() == nil {
					s.log.ErrorContext(ctx, "ingest: country failed", "country", c, "error", err)
					if err := s.store.SaveError(ctx, c, err.Error()); err != nil {
						s.log.ErrorContext(ctx, "ingest: save error", "country", c, "error", err)
					}
				}
			}
		}()
	}
	for _, c := range countries {
		select {
		case jobs <- c:
		case <-ctx.Done():
		}
	}
	close(jobs)
	wg.Wait()
	if err := ctx.Err(); err != nil {
		return err
	}

	if err := s.pool(ctx, archiveEnd, changed.Load() > 0); err != nil {
		return fmt.Errorf("pool small countries: %w", err)
	}
	if s.cfg.SkipRecent {
		return nil
	}
	return s.Recent(ctx, archiveEnd)
}

// order applies the country filter and puts the priority countries first.
func (s *Service) order(all []string) []string {
	keep := all
	if len(s.cfg.Countries) > 0 {
		want := map[string]bool{}
		for _, c := range s.cfg.Countries {
			want[c] = true
		}
		keep = nil
		for _, c := range all {
			if want[c] {
				keep = append(keep, c)
			}
		}
	}
	rank := map[string]int{}
	for i, c := range s.cfg.Priority {
		rank[c] = i - len(s.cfg.Priority)
	}
	out := append([]string(nil), keep...)
	sort.SliceStable(out, func(i, j int) bool { return rank[out[i]] < rank[out[j]] })
	return out
}

// country ingests the changed files of a country and harmonizes it. It
// reports whether the country was harmonized again.
func (s *Service) country(ctx context.Context, idx firms.Index, done map[string]string, country string, archiveEnd harmonize.Month) (bool, error) {
	changed := 0
	for _, p := range products {
		for year := p.firstYear; year <= archiveEnd.Year(); year++ {
			name := firms.FileName(p.name, year, country)
			entry, ok := idx[name]
			if !ok || done[name] == entry.Updated {
				continue // no file (no fire that year) or already ingested
			}
			res, err := s.file(ctx, p, year, country, entry)
			if err != nil {
				return changed > 0, fmt.Errorf("%s: %w", name, err)
			}
			if err := s.store.SaveFile(ctx, res); err != nil {
				return changed > 0, fmt.Errorf("save %s: %w", name, err)
			}
			changed++
		}
	}
	regions, err := s.store.Regions(ctx)
	if err != nil {
		return changed > 0, err
	}
	needs := changed > 0
	for _, r := range regions {
		if r.ID == country && (r.NeedsHarmonize || r.Status == StatusPending || r.Status == StatusError) {
			needs = true
		}
	}
	if !needs {
		return false, nil
	}
	in, err := s.store.LoadInput(ctx, country, archiveEnd)
	if err != nil {
		return true, err
	}
	res, err := harmonize.Harmonize(in)
	if err != nil {
		return true, fmt.Errorf("harmonize: %w", err)
	}
	s.log.InfoContext(ctx, "ingest: harmonized", "country", country, "files", changed, "status", res.Status,
		"model", res.Model, "quality", res.Quality, "points", len(res.Series))
	return true, s.store.SaveResult(ctx, country, res, geoOf(in, res))
}

func (s *Service) file(ctx context.Context, p product, year int, country string, entry firms.IndexEntry) (FileResult, error) {
	res := FileResult{Name: firms.FileName(p.name, year, country), Updated: entry.Updated, Region: country,
		Sensor: p.sensor, Year: year, Summary: harmonize.Summary{}}
	filter := harmonize.Filter{Satellite: p.satellite}
	fixed := map[[2]int32]bool{}
	err := s.src.CountryFile(ctx, p.name, year, country, func(d harmonize.Detection) error {
		res.Detections++
		if p.satellite != harmonize.Aqua && year >= 2023 && d.HasType && d.Type == 2 {
			fixed[[2]int32{int32(math.Round(d.Lat * 100)), int32(math.Round(d.Lon * 100))}] = true
		}
		if filter.Keep(d) && harmonize.MonthOfDate(d.Date).Year() == year {
			res.Summary.Add(d)
		}
		return nil
	})
	if errors.Is(err, firms.ErrNotFound) {
		err = nil // listed in the index but gone: treat as no fire
	}
	for p := range fixed {
		res.Fixed = append(res.Fixed, p)
	}
	return res, err
}

// geoOf describes where a region's fire is, from its own sensors.
func geoOf(in harmonize.Input, res harmonize.Result) RegionGeo {
	g := RegionGeo{BBox: harmonize.BBox{LatMin: 90, LatMax: -90, LonMin: 180, LonMax: -180}}
	var w, sLat, sLon float64
	first, last := harmonize.Month(math.MaxInt32), harmonize.Month(0)
	for _, sum := range []harmonize.Summary{in.Aqua, in.SNPP} {
		for k, c := range sum {
			lat, lon := k.Cell.Center()
			g.BBox.LatMin, g.BBox.LatMax = math.Min(g.BBox.LatMin, lat-harmonize.CellSize/2), math.Max(g.BBox.LatMax, lat+harmonize.CellSize/2)
			g.BBox.LonMin, g.BBox.LonMax = math.Min(g.BBox.LonMin, lon-harmonize.CellSize/2), math.Max(g.BBox.LonMax, lon+harmonize.CellSize/2)
			w += c.N
			sLat += c.N * lat
			sLon += c.N * lon
		}
	}
	if w > 0 {
		g.CentroidLat, g.CentroidLon = sLat/w, sLon/w
	}
	for _, p := range res.Series {
		first, last = min(first, p.Month), max(last, p.Month)
	}
	if len(res.Series) > 0 {
		g.FirstMonth, g.LastMonth = first, last
	}
	return g
}

// pool harmonizes the countries with too little fire with a model learned
// together with their nearest neighbors that have a model of their own. Unless
// force is set (some country changed), only countries never pooled are done.
func (s *Service) pool(ctx context.Context, archiveEnd harmonize.Month, force bool) error {
	regions, err := s.store.Regions(ctx)
	if err != nil {
		return err
	}
	var own []RegionInfo
	for _, r := range regions {
		if r.Status == string(harmonize.StatusOK) && r.Scope == string(harmonize.ScopeOwn) && r.CentroidLat != nil {
			own = append(own, r)
		}
	}
	for _, r := range regions {
		small := r.Status == string(harmonize.StatusInsufficient) || r.Scope == string(harmonize.ScopeRegional)
		if !small || r.CentroidLat == nil || (!force && r.Scope == string(harmonize.ScopeRegional)) {
			continue
		}
		neighbors := nearest(r, own)
		in, err := s.store.LoadInput(ctx, r.ID, archiveEnd)
		if err != nil {
			return err
		}
		var res harmonize.Result
		if len(neighbors) == 0 {
			res, err = harmonize.Harmonize(in)
			res.Reason = strings.TrimSpace(res.Reason + fmt.Sprintf("; no country with a model of its own within %d km to pool with", MaxNeighborKm))
		} else {
			inputs := make([]harmonize.Input, 0, len(neighbors))
			for _, n := range neighbors {
				ni, err := s.store.LoadInput(ctx, n.ID, archiveEnd)
				if err != nil {
					return err
				}
				inputs = append(inputs, ni)
			}
			res, err = harmonize.Pooled(in, inputs)
		}
		if err != nil {
			if err := s.store.SaveError(ctx, r.ID, err.Error()); err != nil {
				return err
			}
			continue
		}
		s.log.InfoContext(ctx, "ingest: pooled", "country", r.ID, "status", res.Status, "with", res.PooledWith, "model", res.Model)
		if err := s.store.SaveResult(ctx, r.ID, res, geoOf(in, res)); err != nil {
			return err
		}
	}
	return nil
}

// nearest returns the closest countries with their own model, adding them
// until there is enough fire to learn from.
func nearest(r RegionInfo, own []RegionInfo) []RegionInfo {
	type cand struct {
		RegionInfo
		km float64
	}
	var cs []cand
	for _, o := range own {
		if o.ID == r.ID {
			continue
		}
		if km := haversineKm(*r.CentroidLat, *r.CentroidLon, *o.CentroidLat, *o.CentroidLon); km <= MaxNeighborKm {
			cs = append(cs, cand{o, km})
		}
	}
	sort.Slice(cs, func(i, j int) bool { return cs[i].km < cs[j].km })
	var out []RegionInfo
	train, exam := r.TrainHotspots, r.ExamHotspots
	for _, c := range cs {
		if len(out) == MaxNeighbors || (len(out) > 0 && train >= harmonize.MinTrainHotspots && exam >= harmonize.MinExamHotspots) {
			break
		}
		out = append(out, c.RegionInfo)
		train, exam = train+c.TrainHotspots, exam+c.ExamHotspots
	}
	return out
}

func haversineKm(lat1, lon1, lat2, lon2 float64) float64 {
	const r = 6371.0
	rad := math.Pi / 180
	dLat, dLon := (lat2-lat1)*rad, (lon2-lon1)*rad
	a := math.Sin(dLat/2)*math.Sin(dLat/2) + math.Cos(lat1*rad)*math.Cos(lat2*rad)*math.Sin(dLon/2)*math.Sin(dLon/2)
	return 2 * r * math.Asin(math.Sqrt(a))
}

// SourceForDay picks the recent source of a day: Suomi NPP until its last
// day, NOAA-20 after; standard processing (final) when available, near real
// time otherwise.
func SourceForDay(day time.Time, av map[string]firms.DateRange) (source string, final, ok bool) {
	in := func(src string) bool {
		r, found := av[src]
		return found && !day.Before(r.Min) && !day.After(r.Max)
	}
	sp, nrt := SourceN20SP, SourceN20NRT
	if !day.After(LastSNPPDay) {
		sp, nrt = SourceSNPPSP, SourceSNPPNRT
	}
	switch {
	case in(sp):
		return sp, true, true
	case in(nrt):
		return nrt, false, true
	}
	return "", false, false
}

func satelliteOf(source string) harmonize.Satellite {
	if strings.Contains(source, "NOAA20") {
		return harmonize.NOAA20
	}
	return harmonize.SNPP
}

// Recent fetches the world's VIIRS for every day after the archive that is
// missing, still near real time and recent, or newly available as final.
func (s *Service) Recent(ctx context.Context, archiveEnd harmonize.Month) error {
	av, err := s.src.Availability(ctx)
	if err != nil {
		return fmt.Errorf("availability: %w", err)
	}
	have, err := s.store.RecentDays(ctx)
	if err != nil {
		return err
	}
	mask, err := s.store.FixedSources(ctx)
	if err != nil {
		return err
	}
	now := s.cfg.Now().UTC()
	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
	refresh := today.AddDate(0, 0, -s.cfg.RecentDays)
	from := time.Date(archiveEnd.Year(), time.Month(archiveEnd.Calendar()), 1, 0, 0, 0, 0, time.UTC).AddDate(0, 1, 0)

	type run struct {
		source string
		final  bool
		from   time.Time
		to     time.Time
	}
	var runs []run
	for d := from; !d.After(today); d = d.AddDate(0, 0, 1) {
		src, final, ok := SourceForDay(d, av)
		if !ok {
			continue
		}
		prev, fetched := have[d.Format(time.DateOnly)]
		switch {
		case fetched && prev.Final:
			continue
		case fetched && !final && prev.Source == src && d.Before(refresh):
			continue // near real time that no longer changes
		}
		if n := len(runs); n > 0 && runs[n-1].source == src && runs[n-1].to.Equal(d.AddDate(0, 0, -1)) && int(d.Sub(runs[n-1].from).Hours()/24) < firms.MaxDays {
			runs[n-1].to = d
			continue
		}
		runs = append(runs, run{source: src, final: final, from: d, to: d})
	}
	s.log.InfoContext(ctx, "ingest: recent", "from", from.Format(time.DateOnly), "requests", len(runs))
	for _, r := range runs {
		if err := s.recentWindow(ctx, r.source, r.final, r.from, r.to, mask); err != nil {
			return err
		}
	}
	return nil
}

func (s *Service) recentWindow(ctx context.Context, source string, final bool, from, to time.Time, mask *harmonize.FixedSources) error {
	filter := harmonize.Filter{Satellite: satelliteOf(source), Mask: mask}
	type key struct {
		day  string
		cell harmonize.Cell
	}
	agg := map[key]*RecentRow{}
	w := RecentWindow{Source: source, Final: final, Detections: map[string]int{}}
	for d := from; !d.After(to); d = d.AddDate(0, 0, 1) {
		w.Days = append(w.Days, d.Format(time.DateOnly))
	}
	err := s.src.AreaRange(ctx, source, "world", from, to, func(d harmonize.Detection) error {
		w.Detections[d.Date]++
		if !filter.Keep(d) {
			return nil
		}
		k := key{d.Date, harmonize.CellOf(d.Lat, d.Lon)}
		r, ok := agg[k]
		if !ok {
			r = &RecentRow{Day: d.Date, Cell: k.cell}
			agg[k] = r
		}
		r.Hotspots++
		r.FRP += d.FRP
		r.Provisional = r.Provisional || d.Provisional()
		return nil
	})
	if err != nil {
		return err
	}
	for _, r := range agg {
		w.Rows = append(w.Rows, *r)
	}
	return s.store.SaveRecent(ctx, w)
}
