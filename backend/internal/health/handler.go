package health

import (
	"context"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/nasa-challenge/app/backend/internal/httpx"
)

// Checker is what the handler needs from the service layer.
type Checker interface {
	Check(ctx context.Context) Report
}

// Handler exposes health endpoints over HTTP.
type Handler struct {
	svc Checker
}

// NewHandler builds a health Handler.
func NewHandler(svc Checker) *Handler {
	return &Handler{svc: svc}
}

// Routes mounts the health routes.
func (h *Handler) Routes(r chi.Router) {
	r.Get("/health", h.get)
}

func (h *Handler) get(w http.ResponseWriter, r *http.Request) {
	report := h.svc.Check(r.Context())
	status := http.StatusOK
	if !report.Healthy() {
		status = http.StatusServiceUnavailable
	}
	httpx.JSON(w, status, report)
}
