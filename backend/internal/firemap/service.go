// Package firemap serves the harmonized hotspots of a period on a grid, for
// the map and the globe.
package firemap

import (
	"context"
	"math"

	"github.com/nasa-challenge/app/backend/internal/calendar"
	"github.com/nasa-challenge/app/backend/internal/geo"
	"github.com/nasa-challenge/app/backend/internal/harmonize"
)

// Resolutions supported, in degrees.
var Resolutions = []float64{0.25, 0.5, 1, 2}

// Cell is one aggregated cell: indices are floor(degrees / resolution).
type Cell struct {
	I, J     int
	Hotspots float64
	FRP      float64
}

// Repository is the data access the map needs.
type Repository interface {
	// Cells sums the series of the area over [from, to], aggregating
	// factor x factor grid cells.
	Cells(ctx context.Context, a geo.Area, from, to harmonize.Month, factor int) ([]Cell, error)
}

// Response is the map of a period.
type Response struct {
	From        string       `json:"from"`
	To          string       `json:"to"`
	Resolution  float64      `json:"resolution"`
	Columns     []string     `json:"columns"`
	Cells       [][4]float64 `json:"cells"`
	Total       float64      `json:"total_hotspots"`
	Max         float64      `json:"max_hotspots"`
	Attribution string       `json:"attribution"`
}

// Service builds maps.
type Service struct {
	repo Repository
}

// NewService builds a Service.
func NewService(repo Repository) *Service { return &Service{repo: repo} }

// Map returns the cells with hotspots of the area over [from, to].
func (s *Service) Map(ctx context.Context, a geo.Area, from, to harmonize.Month, resolution float64) (Response, error) {
	factor := int(math.Round(resolution / harmonize.CellSize))
	cells, err := s.repo.Cells(ctx, a, from, to, factor)
	if err != nil {
		return Response{}, err
	}
	res := Response{From: from.String(), To: to.String(), Resolution: resolution, Attribution: calendar.Attribution,
		Columns: []string{"lat", "lon", "hotspots", "frp_mw"}, Cells: make([][4]float64, 0, len(cells))}
	for _, c := range cells {
		h := math.Round(c.Hotspots*10) / 10
		if h <= 0 {
			continue
		}
		res.Cells = append(res.Cells, [4]float64{(float64(c.I) + 0.5) * resolution, (float64(c.J) + 0.5) * resolution, h, math.Round(c.FRP*10) / 10})
		res.Total += h
		res.Max = math.Max(res.Max, h)
	}
	res.Total = math.Round(res.Total*10) / 10
	return res, nil
}
