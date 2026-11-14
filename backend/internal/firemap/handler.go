package firemap

import (
	"context"
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
	res := 1.0
	if s := q.Get("resolution"); s != "" {
		v, err := strconv.ParseFloat(s, 64)
		ok := err == nil
		if ok {
			ok = false
			for _, r := range Resolutions {
				ok = ok || r == v
			}
		}
		if !ok {
			httpx.Error(w, http.StatusBadRequest, "resolution must be one of 0.25, 0.5, 1 or 2")
			return
		}
		res = v
	}
	out, err := h.svc.Map(r.Context(), a, from, to, res)
	if err != nil {
		slog.ErrorContext(r.Context(), "map", "error", err)
		httpx.Error(w, http.StatusInternalServerError, "could not build the map")
		return
	}
	httpx.JSON(w, http.StatusOK, out)
}
