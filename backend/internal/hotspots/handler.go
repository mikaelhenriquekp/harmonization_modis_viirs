package hotspots

import (
	"context"
	"encoding/csv"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/nasa-challenge/app/backend/internal/calendar"
	"github.com/nasa-challenge/app/backend/internal/firms"
	"github.com/nasa-challenge/app/backend/internal/geo"
	"github.com/nasa-challenge/app/backend/internal/httpx"
)

// Fetcherer is what the handler needs from the service layer.
type Fetcherer interface {
	Fetch(ctx context.Context, q Query) ([]Row, error)
}

// Handler exposes raw hotspots over HTTP.
type Handler struct {
	svc Fetcherer // nil when no FIRMS map key is configured
	now func() time.Time
}

// NewHandler builds a hotspots Handler.
func NewHandler(svc Fetcherer, now func() time.Time) *Handler {
	if now == nil {
		now = time.Now
	}
	return &Handler{svc: svc, now: now}
}

// Routes mounts the hotspots routes.
func (h *Handler) Routes(r chi.Router) {
	r.Get("/hotspots.csv", h.csv)
	r.Get("/hotspots", h.json)
}

// DefaultDays is the period returned when none is asked for.
const DefaultDays = 7

func (h *Handler) fetch(w http.ResponseWriter, r *http.Request) (Query, []Row, bool) {
	if h.svc == nil {
		httpx.Error(w, http.StatusServiceUnavailable, "hotspot downloads are not configured (FIRMS_MAP_KEY)")
		return Query{}, nil, false
	}
	q := r.URL.Query()
	a, err := geo.ParseArea(q)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, err.Error())
		return Query{}, nil, false
	}
	now := h.now().UTC()
	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
	query := Query{Area: a, To: today, All: q.Get("all") == "true"}
	if s := q.Get("to"); s != "" {
		if query.To, err = time.Parse(time.DateOnly, s); err != nil {
			httpx.Error(w, http.StatusBadRequest, "to must be YYYY-MM-DD")
			return Query{}, nil, false
		}
	}
	query.From = query.To.AddDate(0, 0, -(DefaultDays - 1))
	if s := q.Get("from"); s != "" {
		if query.From, err = time.Parse(time.DateOnly, s); err != nil {
			httpx.Error(w, http.StatusBadRequest, "from must be YYYY-MM-DD")
			return Query{}, nil, false
		}
	}
	if query.To.After(today) {
		httpx.Error(w, http.StatusBadRequest, "to must not be in the future")
		return Query{}, nil, false
	}
	rows, err := h.svc.Fetch(r.Context(), query)
	switch {
	case errors.Is(err, ErrInvalid):
		httpx.Error(w, http.StatusBadRequest, err.Error())
	case errors.Is(err, firms.ErrLimit):
		w.Header().Set("Retry-After", "600")
		httpx.Error(w, http.StatusServiceUnavailable, "FIRMS is busy for our key; try again in a few minutes")
	case err != nil:
		slog.ErrorContext(r.Context(), "hotspots", "error", err)
		httpx.Error(w, http.StatusBadGateway, "FIRMS did not answer; try again later")
	default:
		return query, rows, true
	}
	return Query{}, nil, false
}

var columns = []string{"latitude", "longitude", "acq_date", "acq_time", "satellite", "instrument", "confidence",
	"frp", "scan", "track", "daynight", "type", "provisional", "source"}

func record(row Row) []string {
	instrument, typ := "VIIRS", ""
	if row.Satellite.IsMODIS() {
		instrument = "MODIS"
	}
	if row.HasType {
		typ = strconv.Itoa(row.Type)
	}
	num := func(v float64) string { return strconv.FormatFloat(v, 'f', -1, 64) }
	return []string{num(row.Lat), num(row.Lon), row.Date, fmt.Sprintf("%04d", row.Time), string(row.Satellite), instrument,
		row.Confidence, num(row.FRP), num(row.Scan), num(row.Track), string(row.DayNight), typ,
		strconv.FormatBool(row.Provisional()), row.Source}
}

func (h *Handler) csv(w http.ResponseWriter, r *http.Request) {
	q, rows, ok := h.fetch(w, r)
	if !ok {
		return
	}
	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="hotspots_%s_%s.csv"`,
		q.From.Format(time.DateOnly), q.To.Format(time.DateOnly)))
	cw := csv.NewWriter(w)
	_ = cw.Write(columns)
	for _, row := range rows {
		_ = cw.Write(record(row))
	}
	cw.Flush()
}

func (h *Handler) json(w http.ResponseWriter, r *http.Request) {
	q, rows, ok := h.fetch(w, r)
	if !ok {
		return
	}
	out := make([][]any, len(rows))
	for i, row := range rows {
		typ := any(nil)
		if row.HasType {
			typ = row.Type
		}
		out[i] = []any{row.Lat, row.Lon, row.Date, row.Time, row.Satellite, row.Confidence, row.FRP, row.Scan, row.Track,
			string(row.DayNight), typ, row.Provisional(), row.Source}
	}
	httpx.JSON(w, http.StatusOK, map[string]any{
		"from": q.From.Format(time.DateOnly), "to": q.To.Format(time.DateOnly), "count": len(rows),
		"columns": []string{"latitude", "longitude", "acq_date", "acq_time", "satellite", "confidence", "frp", "scan", "track",
			"daynight", "type", "provisional", "source"},
		"rows": out, "attribution": calendar.Attribution,
	})
}
