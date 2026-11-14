// Package hotspots downloads the raw detections of an area and period from
// FIRMS on demand, with the same sources the harmonized calendar uses.
package hotspots

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/nasa-challenge/app/backend/internal/firms"
	"github.com/nasa-challenge/app/backend/internal/geo"
	"github.com/nasa-challenge/app/backend/internal/harmonize"
	"github.com/nasa-challenge/app/backend/internal/ingest"
)

// Limits of one download.
const (
	MaxDays      = 366
	MaxWorldDays = 10
	parallel     = 8
)

// FirstDay is the first day of the harmonized record.
var FirstDay = time.Date(2002, 7, 1, 0, 0, 0, 0, time.UTC)

// firstVIIRSDay is when the calendar switches from Aqua to Suomi NPP.
var firstVIIRSDay = time.Date(2012, 2, 1, 0, 0, 0, 0, time.UTC)

// SourceMODIS is the MODIS standard product of the area API.
const SourceMODIS = "MODIS_SP"

// ErrInvalid means the query is not allowed.
var ErrInvalid = errors.New("invalid hotspots query")

// Fetcher is what the service needs from FIRMS.
type Fetcher interface {
	Availability(ctx context.Context) (map[string]firms.DateRange, error)
	AreaRange(ctx context.Context, source, area string, from, to time.Time, fn func(harmonize.Detection) error) error
}

// Query asks for the detections of an area between two days.
type Query struct {
	Area     geo.Area
	From, To time.Time
	All      bool // every detection FIRMS has, not only the ones the calendar counts
}

// Row is one detection and the FIRMS source it came from.
type Row struct {
	harmonize.Detection
	Source string
}

// Service downloads hotspots.
type Service struct {
	f     Fetcher
	mu    sync.Mutex
	avail map[string]firms.DateRange
	at    time.Time
	now   func() time.Time
}

// NewService builds a Service.
func NewService(f Fetcher) *Service { return &Service{f: f, now: time.Now} }

// Validate checks the limits of a query.
func (s *Service) Validate(q Query) error {
	days := int(q.To.Sub(q.From).Hours()/24) + 1
	switch {
	case q.To.Before(q.From):
		return fmt.Errorf("%w: from must not be after to", ErrInvalid)
	case q.From.Before(FirstDay):
		return fmt.Errorf("%w: the record starts on %s", ErrInvalid, FirstDay.Format(time.DateOnly))
	case q.Area.World && days > MaxWorldDays:
		return fmt.Errorf("%w: for the whole world ask for %d days at most (or pick an area)", ErrInvalid, MaxWorldDays)
	case days > MaxDays:
		return fmt.Errorf("%w: ask for %d days at most; the monthly calendar CSV covers the whole record", ErrInvalid, MaxDays)
	}
	return nil
}

func (s *Service) availability(ctx context.Context) (map[string]firms.DateRange, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.avail != nil && s.now().Sub(s.at) < time.Hour {
		return s.avail, nil
	}
	av, err := s.f.Availability(ctx)
	if err != nil {
		return nil, err
	}
	s.avail, s.at = av, s.now()
	return av, nil
}

// sourceFor picks the source of a day: Aqua before the calendar switches to
// VIIRS, then the same VIIRS source the ingest uses.
func sourceFor(day time.Time, av map[string]firms.DateRange) (string, bool) {
	if day.Before(firstVIIRSDay) {
		r, ok := av[SourceMODIS]
		return SourceMODIS, ok && !day.Before(r.Min) && !day.After(r.Max)
	}
	src, _, ok := ingest.SourceForDay(day, av)
	return src, ok
}

func satelliteOf(source string) harmonize.Satellite {
	switch {
	case strings.HasPrefix(source, "MODIS"):
		return harmonize.Aqua
	case strings.Contains(source, "NOAA20"):
		return harmonize.NOAA20
	default:
		return harmonize.SNPP
	}
}

func f(v float64) string { return strconv.FormatFloat(v, 'f', -1, 64) }

// areas are the FIRMS area strings for the query: "world", one box, or two
// boxes when it crosses the antimeridian.
func areas(a geo.Area) []string {
	if a.World {
		return []string{"world"}
	}
	w, s, e, n := a.BBox[0], a.BBox[1], a.BBox[2], a.BBox[3] // a polygon is fetched by its box and cropped
	if w < e {
		return []string{strings.Join([]string{f(w), f(s), f(e), f(n)}, ",")}
	}
	return []string{strings.Join([]string{f(w), f(s), "180", f(n)}, ","), strings.Join([]string{"-180", f(s), f(e), f(n)}, ",")}
}

type job struct {
	source, area string
	from, to     time.Time
}

// Fetch downloads the detections of the query, sorted by date and time.
func (s *Service) Fetch(ctx context.Context, q Query) ([]Row, error) {
	if err := s.Validate(q); err != nil {
		return nil, err
	}
	av, err := s.availability(ctx)
	if err != nil {
		return nil, fmt.Errorf("availability: %w", err)
	}
	var jobs []job
	for d := q.From; !d.After(q.To); d = d.AddDate(0, 0, 1) {
		src, ok := sourceFor(d, av)
		if !ok {
			continue
		}
		n := len(jobs)
		if n > 0 && jobs[n-1].source == src && jobs[n-1].to.Equal(d.AddDate(0, 0, -1)) && int(d.Sub(jobs[n-1].from).Hours()/24) < firms.MaxDays {
			jobs[n-1].to = d
			continue
		}
		jobs = append(jobs, job{source: src, from: d, to: d})
	}
	var all []job
	for _, j := range jobs {
		for _, a := range areas(q.Area) {
			j.area = a
			all = append(all, j)
		}
	}

	ctx, cancel := context.WithCancel(ctx)
	defer cancel()
	results := make([][]Row, len(all))
	errs := make([]error, len(all))
	sem := make(chan struct{}, parallel)
	var wg sync.WaitGroup
	for i, j := range all {
		wg.Add(1)
		go func() {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()
			filter := harmonize.Filter{Satellite: satelliteOf(j.source)}
			errs[i] = s.f.AreaRange(ctx, j.source, j.area, j.from, j.to, func(d harmonize.Detection) error {
				if (q.All || filter.Keep(d)) && q.Area.ContainsPoint(d.Lat, d.Lon) {
					results[i] = append(results[i], Row{Detection: d, Source: j.source})
				}
				return nil
			})
			if errs[i] != nil {
				cancel()
			}
		}()
	}
	wg.Wait()
	if err := errors.Join(errs...); err != nil {
		for _, e := range errs {
			if e != nil && !errors.Is(e, context.Canceled) {
				return nil, e
			}
		}
		return nil, err
	}
	var out []Row
	for _, r := range results {
		out = append(out, r...)
	}
	sort.SliceStable(out, func(i, j int) bool {
		if out[i].Date != out[j].Date {
			return out[i].Date < out[j].Date
		}
		return out[i].Time < out[j].Time
	})
	return out, nil
}
