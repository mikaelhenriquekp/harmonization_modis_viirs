package calendar

import (
	"context"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/nasa-challenge/app/backend/internal/geo"
	"github.com/nasa-challenge/app/backend/internal/harmonize"
)

// Attribution is the acknowledgment NASA asks for when FIRMS data is shared.
const Attribution = "We acknowledge the use of data and/or imagery from NASA's Fire Information for Resource Management System (FIRMS) " +
	"(https://earthdata.nasa.gov/firms), part of NASA's Land, Atmosphere Near real-time Capability for Earth observations (LANCE) " +
	"(https://earthdata.nasa.gov/lance) and NASA's Earth Science Data and Information System (ESDIS)."

// SensorTotal is the raw total of one sensor in an area for a month.
type SensorTotal struct {
	Sensor   string
	Month    harmonize.Month
	Hotspots float64
}

// RegionNote describes a country that overlaps the area.
type RegionNote struct {
	ID         string   `json:"id"`
	Name       string   `json:"name"`
	Status     string   `json:"status"`
	Quality    string   `json:"quality,omitempty"`
	Scope      string   `json:"scope,omitempty"`
	Model      string   `json:"model,omitempty"`
	PooledWith []string `json:"pooled_with,omitempty"`
	Warnings   []string `json:"warnings,omitempty"`
}

// Repository is the data access the calendar needs.
type Repository interface {
	// MonthlyTotals sums the harmonized series of the area: archive months up
	// to archiveEnd, recent VIIRS days after it.
	MonthlyTotals(ctx context.Context, a geo.Area, from, to, archiveEnd harmonize.Month) ([]MonthTotal, error)
	SensorTotals(ctx context.Context, a geo.Area, from, to harmonize.Month) ([]SensorTotal, error)
	ArchiveEnd(ctx context.Context) (harmonize.Month, error)
	// LastDay is the last day of data (the last recent day fetched).
	LastDay(ctx context.Context) (time.Time, error)
	RegionsIn(ctx context.Context, a geo.Area) ([]RegionNote, error)
}

// AreaInfo describes the area that was summed.
type AreaInfo struct {
	World    bool       `json:"world"`
	BBox     [4]float64 `json:"bbox"`      // as requested: west, south, east, north
	GridBBox [4]float64 `json:"grid_bbox"` // the 0.25° cells actually summed
	Cells    int        `json:"cells"`
}

// Response is the calendar of an area.
type Response struct {
	Area        AreaInfo     `json:"area"`
	ArchiveEnd  string       `json:"archive_end"`
	Calendar    Calendar     `json:"calendar"`
	Regions     []RegionNote `json:"regions"`
	Notes       []string     `json:"notes"`
	Attribution string       `json:"attribution"`
}

// Service builds calendars, with a short cache because the same areas (whole
// countries, the world) are asked for again and again.
type Service struct {
	repo  Repository
	now   func() time.Time
	ttl   time.Duration
	mu    sync.Mutex
	cache map[string]cached
}

type cached struct {
	at  time.Time
	val any
}

// NewService builds a Service.
func NewService(repo Repository, now func() time.Time) *Service {
	if now == nil {
		now = time.Now
	}
	return &Service{repo: repo, now: now, ttl: 10 * time.Minute, cache: map[string]cached{}}
}

func (s *Service) remember(key string, build func() (any, error)) (any, error) {
	s.mu.Lock()
	c, ok := s.cache[key]
	s.mu.Unlock()
	if ok && s.now().Sub(c.at) < s.ttl {
		return c.val, nil
	}
	v, err := build()
	if err != nil {
		return nil, err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if len(s.cache) > 500 {
		s.cache = map[string]cached{}
	}
	s.cache[key] = cached{at: s.now(), val: v}
	return v, nil
}

func key(kind string, a geo.Area, from, to harmonize.Month) string {
	return fmt.Sprintf("%s|%v|%s|%s", kind, a.Args(), from, to)
}

func areaInfo(a geo.Area) AreaInfo {
	return AreaInfo{World: a.World, BBox: a.BBox, GridBBox: a.GridBBox(), Cells: a.Cells()}
}

// Calendar returns the burning calendar of an area between two months.
func (s *Service) Calendar(ctx context.Context, a geo.Area, from, to harmonize.Month) (Response, error) {
	v, err := s.remember(key("calendar", a, from, to), func() (any, error) {
		end, err := s.repo.ArchiveEnd(ctx)
		if err != nil {
			return nil, err
		}
		totals, err := s.repo.MonthlyTotals(ctx, a, max(from, FirstMonth), to, end)
		if err != nil {
			return nil, err
		}
		regions, err := s.repo.RegionsIn(ctx, a)
		if err != nil {
			return nil, err
		}
		last, err := s.repo.LastDay(ctx)
		if err != nil {
			return nil, err
		}
		cal := Build(totals, Query{From: from, To: to, Now: s.now(), DataUntil: last})
		return Response{
			Area: areaInfo(a), ArchiveEnd: end.String(), Calendar: cal, Regions: regions,
			Notes: notes(cal, regions), Attribution: Attribution,
		}, nil
	})
	if err != nil {
		return Response{}, err
	}
	return v.(Response), nil
}

func notes(c Calendar, regions []RegionNote) []string {
	out := []string{}
	if len(c.Months) > 0 && c.Months[0].Estimated {
		out = append(out, fmt.Sprintf("Months up to %s are an estimate of what VIIRS would have seen, rebuilt from MODIS Aqua "+
			"with each country's harmonization model; use them for patterns, not for single fires.", harmonize.ReconstructTo))
	}
	out = append(out, "A month without hotspots means none were detected (clouds, smoke and small or short fires can hide fire), not that there was no fire.")
	if n := len(c.Months); n > 0 && (c.Months[n-1].Incomplete || c.Months[n-1].Provisional) {
		out = append(out, "The last months are near real time data (provisional) and the current month is incomplete: it is compared at its current pace.")
	}
	var pooled, missing, review []string
	for _, r := range regions {
		switch {
		case r.Status != string(harmonize.StatusOK):
			missing = append(missing, r.Name)
		case r.Scope == string(harmonize.ScopeRegional):
			pooled = append(pooled, fmt.Sprintf("%s (with %s)", r.Name, strings.Join(r.PooledWith, ", ")))
		case r.Quality == string(harmonize.QualityReview):
			review = append(review, r.Name)
		}
	}
	if len(pooled) > 0 {
		out = append(out, "Harmonized with a regional model because they have too little fire of their own: "+strings.Join(pooled, "; ")+".")
	}
	if len(review) > 0 {
		out = append(out, "Harmonization to review (see the region's warnings): "+strings.Join(review, ", ")+".")
	}
	if len(missing) > 0 {
		out = append(out, "No harmonized history yet for: "+strings.Join(missing, ", ")+"; only their recent VIIRS days are counted.")
	}
	return out
}

// SensorMonth compares the raw sensors and the harmonized series in a month.
type SensorMonth struct {
	Month      string  `json:"month"`
	Aqua       float64 `json:"aqua"`
	SNPP       float64 `json:"snpp"`
	N20        float64 `json:"n20"`
	Harmonized float64 `json:"harmonized"`
}

// Ratios between sensors over their overlap in the requested period.
type Ratios struct {
	SNPPOverAqua *float64 `json:"snpp_over_aqua"` // what harmonization corrects
	N20OverSNPP  *float64 `json:"n20_over_snpp"`  // should be close to 1
}

// SensorsResponse shows why the record needs harmonizing.
type SensorsResponse struct {
	Area        AreaInfo      `json:"area"`
	Months      []SensorMonth `json:"months"`
	Ratios      Ratios        `json:"ratios"`
	Attribution string        `json:"attribution"`
}

// Sensors returns the raw MODIS Aqua, Suomi NPP and NOAA-20 counts of an area
// next to the harmonized series.
func (s *Service) Sensors(ctx context.Context, a geo.Area, from, to harmonize.Month) (SensorsResponse, error) {
	v, err := s.remember(key("sensors", a, from, to), func() (any, error) {
		end, err := s.repo.ArchiveEnd(ctx)
		if err != nil {
			return nil, err
		}
		from := max(from, FirstMonth)
		raw, err := s.repo.SensorTotals(ctx, a, from, to)
		if err != nil {
			return nil, err
		}
		harm, err := s.repo.MonthlyTotals(ctx, a, from, to, end)
		if err != nil {
			return nil, err
		}
		months := map[harmonize.Month]*SensorMonth{}
		var out []SensorMonth
		for _, m := range harmonize.MonthRange(from, to) {
			out = append(out, SensorMonth{Month: m.String()})
		}
		for i := range out {
			months[harmonize.MustMonth(out[i].Month)] = &out[i]
		}
		var aqua, snppA, snppN, n20 float64
		for _, t := range raw {
			m, ok := months[t.Month]
			if !ok {
				continue
			}
			switch t.Sensor {
			case "aqua":
				m.Aqua = round1(t.Hotspots)
			case "snpp":
				m.SNPP = round1(t.Hotspots)
			case "n20":
				m.N20 = round1(t.Hotspots)
			}
		}
		for _, m := range out {
			mm := harmonize.MustMonth(m.Month)
			if mm > harmonize.ReconstructTo && m.Aqua > 0 && mm <= end {
				aqua += m.Aqua
				snppA += m.SNPP
			}
			if m.N20 > 0 && m.SNPP > 0 {
				n20 += m.N20
				snppN += m.SNPP
			}
		}
		for _, t := range harm {
			if m, ok := months[t.Month]; ok {
				m.Harmonized = round1(t.Hotspots)
			}
		}
		r := Ratios{}
		if aqua > 0 {
			r.SNPPOverAqua = ptr(snppA / aqua)
		}
		if snppN > 0 {
			r.N20OverSNPP = ptr(n20 / snppN)
		}
		return SensorsResponse{Area: areaInfo(a), Months: out, Ratios: r, Attribution: Attribution}, nil
	})
	if err != nil {
		return SensorsResponse{}, err
	}
	return v.(SensorsResponse), nil
}
