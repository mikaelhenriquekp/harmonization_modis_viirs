package firemap

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/nasa-challenge/app/backend/internal/calendar"
	"github.com/nasa-challenge/app/backend/internal/geo"
	"github.com/nasa-challenge/app/backend/internal/harmonize"
	"github.com/nasa-challenge/app/backend/internal/httpx"
)

// Mapper is what the handler needs from the service layer.
type Mapper interface {
	Map(ctx context.Context, a geo.Area, from, to harmonize.Month, resolution float64) (Response, error)
	Anomalies(ctx context.Context, a geo.Area, m harmonize.Month, resolution float64) (AnomalyResponse, error)
	LastDay(ctx context.Context) (time.Time, error)
}

// Handler exposes the map over HTTP.
type Handler struct {
	svc Mapper
	now func() time.Time
}

// NewHandler builds a map Handler.
func NewHandler(svc Mapper, now func() time.Time) *Handler {
	if now == nil {
		now = time.Now
	}
	return &Handler{svc: svc, now: now}
}

// Routes mounts the map routes.
func (h *Handler) Routes(r chi.Router) {
	r.Get("/map", h.get)
	r.Get("/map/anomalies", h.anomalies)
}

func parseResolution(w http.ResponseWriter, s string) (float64, bool) {
	if s == "" {
		return 1, true
	}
	v, err := strconv.ParseFloat(s, 64)
	if err == nil {
		for _, r := range Resolutions {
			if r == v {
				return v, true
			}
		}
	}
	httpx.Error(w, http.StatusBadRequest, "resolution must be one of 0.25, 0.5, 1 or 2")
	return 0, false
}

func (h *Handler) anomalies(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	a, err := geo.ParseArea(q)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	res, ok := parseResolution(w, q.Get("resolution"))
	if !ok {
		return
	}
	now := h.now()
	m := harmonize.NewMonth(now.Year(), int(now.Month()))
	if s := q.Get("month"); s != "" {
		if m, err = harmonize.ParseMonth(s); err != nil {
			httpx.Error(w, http.StatusBadRequest, err.Error())
			return
		}
	} else if last, err := h.svc.LastDay(r.Context()); err == nil {
		m = harmonize.NewMonth(last.Year(), int(last.Month()))
	}
	if m < calendar.FirstMonth {
		httpx.Error(w, http.StatusBadRequest, "the record starts in "+calendar.FirstMonth.String())
		return
	}
	out, err := h.svc.Anomalies(r.Context(), a, m, res)
	if errors.Is(err, ErrNoData) {
		httpx.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	if err != nil {
		slog.ErrorContext(r.Context(), "map anomalies", "error", err)
		httpx.Error(w, http.StatusInternalServerError, "could not build the anomaly map")
		return
	}
	httpx.JSON(w, http.StatusOK, out)
}

func (h *Handler) get(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	a, err := geo.ParseArea(q)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	now := h.now()
	current := harmonize.NewMonth(now.Year(), int(now.Month()))
	if q.Get("from") == "" {
		q.Set("from", current.String())
	}
	if q.Get("to") == "" {
		q.Set("to", q.Get("from"))
	}
	from, to, err := calendar.ParseRange(q, now)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	res, ok := parseResolution(w, q.Get("resolution"))
	if !ok {
		return
	}
	out, err := h.svc.Map(r.Context(), a, from, to, res)
	if err != nil {
		slog.ErrorContext(r.Context(), "map", "error", err)
		httpx.Error(w, http.StatusInternalServerError, "could not build the map")
		return
	}
	httpx.JSON(w, http.StatusOK, out)
}
