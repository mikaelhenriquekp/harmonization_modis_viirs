// Package regions describes the harmonized countries: their model, exam,
// quality and warnings, and how much of the world is covered.
package regions

import (
	"context"
	"encoding/json"
	"errors"

	"github.com/nasa-challenge/app/backend/internal/calendar"
	"github.com/nasa-challenge/app/backend/internal/harmonize"
)

// ErrNotFound means there is no such region.
var ErrNotFound = errors.New("region not found")

// Summary is a region in the list.
type Summary struct {
	ID          string      `json:"id"`
	Name        string      `json:"name"`
	Status      string      `json:"status"`
	Reason      string      `json:"reason,omitempty"`
	Scope       string      `json:"scope,omitempty"`
	PooledWith  []string    `json:"pooled_with"`
	Model       string      `json:"model,omitempty"`
	ModelName   string      `json:"model_name,omitempty"`
	EnergyModel string      `json:"energy_model,omitempty"`
	Quality     string      `json:"quality,omitempty"`
	Warnings    []string    `json:"warnings"`
	BBox        *[4]float64 `json:"bbox"`     // west, south, east, north of its fire
	Centroid    *[2]float64 `json:"centroid"` // lat, lon
	FirstMonth  string      `json:"first_month,omitempty"`
	LastMonth   string      `json:"last_month,omitempty"`
}

// Detail adds the exam of every model to a Summary.
type Detail struct {
	Summary
	TrainHotspots int                  `json:"train_hotspots"`
	ExamHotspots  int                  `json:"exam_hotspots"`
	ExamBiasPct   *float64             `json:"exam_bias_pct"`
	ExamR2        *float64             `json:"exam_r2"`
	Exam          json.RawMessage      `json:"exam"`
	EnergyExam    json.RawMessage      `json:"energy_exam"`
	Jumps         json.RawMessage      `json:"jumps"`
	Handover      *float64             `json:"handover_noaa20_over_snpp"`
	Periods       map[string][2]string `json:"periods"`
	HarmonizedAt  string               `json:"harmonized_at,omitempty"`
}

// Counts of regions by state.
type Counts struct {
	Total        int `json:"total"`
	Harmonized   int `json:"harmonized"`
	Own          int `json:"own_model"`
	Regional     int `json:"regional_model"`
	Insufficient int `json:"insufficient_data"`
	Pending      int `json:"pending"`
	Error        int `json:"error"`
}

// Ingest is the state of the ingest job.
type Ingest struct {
	Phase      string `json:"phase"` // archive | pool | recent | idle
	StartedAt  string `json:"started_at,omitempty"`
	FinishedAt string `json:"finished_at,omitempty"`
	LastError  string `json:"last_error,omitempty"`
}

// Coverage says what the data covers.
type Coverage struct {
	DataStart      string   `json:"data_start"`
	ArchiveEnd     string   `json:"archive_end"`
	RecentFirstDay string   `json:"recent_first_day,omitempty"`
	RecentLastDay  string   `json:"recent_last_day,omitempty"`
	RecentFinalTo  string   `json:"recent_final_until,omitempty"`
	Regions        Counts   `json:"regions"`
	Ingest         Ingest   `json:"ingest"`
	CellDegrees    float64  `json:"cell_degrees"`
	Citations      []string `json:"citations"`
	Attribution    string   `json:"attribution"`
}

// Repository is the data access the service needs.
type Repository interface {
	List(ctx context.Context) ([]Summary, error)
	Get(ctx context.Context, id string) (Detail, error)
	Coverage(ctx context.Context) (Coverage, error)
}

// Service serves regions.
type Service struct {
	repo Repository
}

// NewService builds a Service.
func NewService(repo Repository) *Service { return &Service{repo: repo} }

// List returns every region.
func (s *Service) List(ctx context.Context) ([]Summary, error) {
	out, err := s.repo.List(ctx)
	for i := range out {
		out[i].ModelName = modelName(out[i].Model)
	}
	return out, err
}

// Get returns one region with its exam.
func (s *Service) Get(ctx context.Context, id string) (Detail, error) {
	d, err := s.repo.Get(ctx, id)
	if err != nil {
		return d, err
	}
	d.ModelName = modelName(d.Model)
	d.Periods = map[string][2]string{
		"learn":         {harmonize.LearnFrom.String(), harmonize.LearnTo.String()},
		"exam":          {harmonize.ExamFrom.String(), harmonize.ExamTo.String()},
		"reconstructed": {harmonize.ReconstructFrom.String(), harmonize.ReconstructTo.String()},
	}
	return d, nil
}

// Coverage returns what the data covers, with region counts.
func (s *Service) Coverage(ctx context.Context) (Coverage, error) {
	c, err := s.repo.Coverage(ctx)
	if err != nil {
		return c, err
	}
	list, err := s.repo.List(ctx)
	if err != nil {
		return c, err
	}
	for _, r := range list {
		c.Regions.Total++
		switch r.Status {
		case string(harmonize.StatusOK):
			c.Regions.Harmonized++
			if r.Scope == string(harmonize.ScopeRegional) {
				c.Regions.Regional++
			} else {
				c.Regions.Own++
			}
		case string(harmonize.StatusInsufficient):
			c.Regions.Insufficient++
		case "pending":
			c.Regions.Pending++
		default:
			c.Regions.Error++
		}
	}
	c.DataStart = calendar.FirstMonth.String()
	c.CellDegrees = harmonize.CellSize
	c.Attribution = calendar.Attribution
	c.Citations = Citations
	return c, nil
}

// Citations of the FIRMS products used.
var Citations = []string{
	"MODIS Collection 6.1 Active Fire MCD14ML, NASA FIRMS, doi:10.5067/FIRMS/MODIS/MCD14ML",
	"VIIRS 375 m Active Fire VNP14IMGT (Suomi NPP), NASA FIRMS, doi:10.5067/FIRMS/VIIRS/VNP14IMGT_NRT.002",
	"VIIRS 375 m Active Fire VJ114IMGT (NOAA-20), NASA FIRMS, doi:10.5067/FIRMS/VIIRS/VJ114IMGT_NRT.002",
}

func modelName(id string) string {
	if m, ok := harmonize.CountModels[harmonize.ModelID(id)]; ok {
		return m.Name
	}
	return ""
}
