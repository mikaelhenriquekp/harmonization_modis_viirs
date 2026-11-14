package firemap

import (
	"context"
	"errors"
	"fmt"
	"math"
	"sync"
	"time"

	"github.com/nasa-challenge/app/backend/internal/calendar"
	"github.com/nasa-challenge/app/backend/internal/geo"
	"github.com/nasa-challenge/app/backend/internal/harmonize"
)

// MinYearsCompared is the history a cell needs to be classified.
const MinYearsCompared = 5

// CellYear is the total of an aggregated cell for the requested calendar
// month of one year.
type CellYear struct {
	I, J     int
	Year     int
	Hotspots float64
}

// Anomaly is one cell of the early warning map.
type Anomaly struct {
	Lat        float64  `json:"lat"`
	Lon        float64  `json:"lon"`
	Hotspots   float64  `json:"hotspots"`  // so far
	Projected  float64  `json:"projected"` // for the whole month at the current pace
	Median     *float64 `json:"median"`    // of the same month in past years
	AnomalyPct *float64 `json:"anomaly_pct"`
	Percentile *float64 `json:"percentile"`
	Rank       int      `json:"rank"`
	Status     string   `json:"status"`
}

// AnomalyResponse is the early warning map of a month.
type AnomalyResponse struct {
	Month           string         `json:"month"`
	DataUntil       string         `json:"data_until"`
	ElapsedFraction float64        `json:"elapsed_fraction"`
	Resolution      float64        `json:"resolution"`
	YearsCompared   int            `json:"years_compared"`
	Cells           []Anomaly      `json:"cells"`
	Counts          map[string]int `json:"counts"`
	Attribution     string         `json:"attribution"`
}

// ErrNoData means the month is after the last day of data.
var ErrNoData = errors.New("no data for this month yet")

// anomalyCache keeps maps for a while: they scan every year of the month.
type anomalyCache struct {
	mu   sync.Mutex
	at   map[string]time.Time
	vals map[string]AnomalyResponse
}

var cacheTTL = 30 * time.Minute

// Anomalies compares every cell's month with the same month of past years:
// where is fire unusual now?
func (s *Service) Anomalies(ctx context.Context, a geo.Area, m harmonize.Month, resolution float64) (AnomalyResponse, error) {
	last, err := s.repo.LastDay(ctx)
	if err != nil {
		return AnomalyResponse{}, err
	}
	lastMonth := harmonize.NewMonth(last.Year(), int(last.Month()))
	if m > lastMonth {
		return AnomalyResponse{}, fmt.Errorf("%w: the data ends on %s", ErrNoData, last.Format(time.DateOnly))
	}
	key := fmt.Sprintf("%s|%s|%v|%s", a.Key(), m, resolution, last.Format(time.DateOnly))
	s.cache.mu.Lock()
	if at, ok := s.cache.at[key]; ok && time.Since(at) < cacheTTL {
		v := s.cache.vals[key]
		s.cache.mu.Unlock()
		return v, nil
	}
	s.cache.mu.Unlock()

	factor := int(math.Round(resolution / harmonize.CellSize))
	rows, err := s.repo.SameMonth(ctx, a, m, factor)
	if err != nil {
		return AnomalyResponse{}, err
	}
	elapsed := 1.0
	days := time.Date(last.Year(), last.Month()+1, 0, 0, 0, 0, 0, time.UTC).Day()
	if m == lastMonth && last.Day() < days {
		elapsed = float64(last.Day()) / float64(days)
	}
	firstYear := calendar.FirstMonth.Year()
	if harmonize.NewMonth(firstYear, m.Calendar()) < calendar.FirstMonth {
		firstYear++
	}
	years := m.Year() - firstYear

	type cell struct{ i, j int }
	byCell := map[cell]map[int]float64{}
	for _, r := range rows {
		c := cell{r.I, r.J}
		if byCell[c] == nil {
			byCell[c] = map[int]float64{}
		}
		byCell[c][r.Year] += r.Hotspots
	}
	res := AnomalyResponse{
		Month: m.String(), DataUntil: last.Format(time.DateOnly), ElapsedFraction: math.Round(elapsed*1000) / 1000,
		Resolution: resolution, YearsCompared: years, Cells: []Anomaly{}, Counts: map[string]int{}, Attribution: calendar.Attribution,
	}
	for c, ys := range byCell {
		past := make([]float64, 0, years)
		var pastTotal float64
		for y := firstYear; y < m.Year(); y++ {
			past = append(past, ys[y]) // a year without hotspots counts as 0
			pastTotal += ys[y]
		}
		now := ys[m.Year()]
		projected := now / elapsed
		var cmp calendar.Comparison
		// Without any past fire there is nothing to compare with (often a
		// country with no harmonized history), so it is not called an anomaly.
		if years >= MinYearsCompared && pastTotal > 0 {
			cmp = calendar.Compare(past, projected)
		} else {
			cmp = calendar.Compare(nil, projected)
		}
		if now == 0 && (cmp.Median == nil || *cmp.Median == 0) {
			continue // no fire now and usually none either
		}
		res.Cells = append(res.Cells, Anomaly{
			Lat: (float64(c.i) + 0.5) * resolution, Lon: (float64(c.j) + 0.5) * resolution,
			Hotspots: math.Round(now*10) / 10, Projected: math.Round(projected*10) / 10,
			Median: cmp.Median, AnomalyPct: cmp.AnomalyPct, Percentile: cmp.Percentile, Rank: cmp.Rank, Status: cmp.Status,
		})
		res.Counts[cmp.Status]++
	}
	s.cache.mu.Lock()
	defer s.cache.mu.Unlock()
	if len(s.cache.at) > 200 {
		s.cache.at, s.cache.vals = map[string]time.Time{}, map[string]AnomalyResponse{}
	}
	s.cache.at[key], s.cache.vals[key] = time.Now(), res
	return res, nil
}

// LastDay is the last day of data.
func (s *Service) LastDay(ctx context.Context) (time.Time, error) { return s.repo.LastDay(ctx) }
