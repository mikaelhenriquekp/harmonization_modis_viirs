package calendar

import (
	"context"
	"encoding/csv"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"net/url"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/nasa-challenge/app/backend/internal/geo"
	"github.com/nasa-challenge/app/backend/internal/harmonize"
	"github.com/nasa-challenge/app/backend/internal/httpx"
)

// Calendarer is what the handler needs from the service layer.
type Calendarer interface {
	Calendar(ctx context.Context, a geo.Area, from, to harmonize.Month) (Response, error)
	Sensors(ctx context.Context, a geo.Area, from, to harmonize.Month) (SensorsResponse, error)
}

// Handler exposes the burning calendar over HTTP.
type Handler struct {
	svc Calendarer
	now func() time.Time
}

// NewHandler builds a calendar Handler.
func NewHandler(svc Calendarer, now func() time.Time) *Handler {
	if now == nil {
		now = time.Now
	}
	return &Handler{svc: svc, now: now}
}

// Routes mounts the calendar routes.
func (h *Handler) Routes(r chi.Router) {
	r.Get("/calendar", h.get)
	r.Get("/calendar.csv", h.csv)
	r.Get("/sensors", h.sensors)
}

var errBadRequest = errors.New("bad request")

// ParseRange reads "from" and "to" (YYYY-MM). They default to the whole record
// up to the current month.
func ParseRange(q url.Values, now time.Time) (from, to harmonize.Month, err error) {
	current := harmonize.NewMonth(now.Year(), int(now.Month()))
	from, to = FirstMonth, current
	if s := q.Get("from"); s != "" {
		if from, err = harmonize.ParseMonth(s); err != nil {
			return 0, 0, fmt.Errorf("%w: from: %w", errBadRequest, err)
		}
	}
	if s := q.Get("to"); s != "" {
		if to, err = harmonize.ParseMonth(s); err != nil {
			return 0, 0, fmt.Errorf("%w: to: %w", errBadRequest, err)
		}
	}
	switch {
	case from > to:
		return 0, 0, fmt.Errorf("%w: from must not be after to", errBadRequest)
	case to > current:
		return 0, 0, fmt.Errorf("%w: to must not be after the current month (%s)", errBadRequest, current)
	case to < FirstMonth:
		return 0, 0, fmt.Errorf("%w: the record starts in %s", errBadRequest, FirstMonth)
	}
	return max(from, FirstMonth), to, nil
}

func (h *Handler) parse(w http.ResponseWriter, r *http.Request) (geo.Area, harmonize.Month, harmonize.Month, bool) {
	q := r.URL.Query()
	a, err := geo.ParseArea(q)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, err.Error())
		return geo.Area{}, 0, 0, false
	}
	from, to, err := ParseRange(q, h.now())
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, err.Error())
		return geo.Area{}, 0, 0, false
	}
	return a, from, to, true
}

func (h *Handler) fail(w http.ResponseWriter, r *http.Request, err error) {
	slog.ErrorContext(r.Context(), "calendar", "path", r.URL.Path, "error", err)
	httpx.Error(w, http.StatusInternalServerError, "could not build the calendar")
}

func (h *Handler) get(w http.ResponseWriter, r *http.Request) {
	a, from, to, ok := h.parse(w, r)
	if !ok {
		return
	}
	res, err := h.svc.Calendar(r.Context(), a, from, to)
	if err != nil {
		h.fail(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusOK, res)
}

func (h *Handler) sensors(w http.ResponseWriter, r *http.Request) {
	a, from, to, ok := h.parse(w, r)
	if !ok {
		return
	}
	res, err := h.svc.Sensors(r.Context(), a, from, to)
	if err != nil {
		h.fail(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusOK, res)
}

func num(v float64) string { return strconv.FormatFloat(v, 'f', -1, 64) }

func opt(v *float64) string {
	if v == nil {
		return ""
	}
	return num(*v)
}

func (h *Handler) csv(w http.ResponseWriter, r *http.Request) {
	a, from, to, ok := h.parse(w, r)
	if !ok {
		return
	}
	res, err := h.svc.Calendar(r.Context(), a, from, to)
	if err != nil {
		h.fail(w, r, err)
		return
	}
	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="burning-calendar_%s_%s.csv"`, from, to))
	cw := csv.NewWriter(w)
	_ = cw.Write([]string{"month", "hotspots", "frp_mw", "source", "estimated", "provisional", "incomplete",
		"median_same_month", "anomaly_pct", "percentile"})
	for _, m := range res.Calendar.Months {
		_ = cw.Write([]string{m.Month, num(m.Hotspots), num(m.FRP), m.Source, strconv.FormatBool(m.Estimated),
			strconv.FormatBool(m.Provisional), strconv.FormatBool(m.Incomplete), opt(m.Median), opt(m.AnomalyPct), opt(m.Percentile)})
	}
	cw.Flush()
}
