package regions

import (
	"context"
	"errors"
	"log/slog"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/nasa-challenge/app/backend/internal/httpx"
)

// Provider is what the handler needs from the service layer.
type Provider interface {
	List(ctx context.Context) ([]Summary, error)
	Get(ctx context.Context, id string) (Detail, error)
	Coverage(ctx context.Context) (Coverage, error)
}

// Handler exposes regions over HTTP.
type Handler struct {
	svc Provider
}

// NewHandler builds a regions Handler.
func NewHandler(svc Provider) *Handler { return &Handler{svc: svc} }

// Routes mounts the regions routes.
func (h *Handler) Routes(r chi.Router) {
	r.Get("/regions", h.list)
	r.Get("/regions/{id}", h.get)
	r.Get("/coverage", h.coverage)
}

func fail(w http.ResponseWriter, r *http.Request, err error) {
	slog.ErrorContext(r.Context(), "regions", "path", r.URL.Path, "error", err)
	httpx.Error(w, http.StatusInternalServerError, "could not read regions")
}

func (h *Handler) list(w http.ResponseWriter, r *http.Request) {
	out, err := h.svc.List(r.Context())
	if err != nil {
		fail(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"regions": out})
}

func (h *Handler) get(w http.ResponseWriter, r *http.Request) {
	d, err := h.svc.Get(r.Context(), chi.URLParam(r, "id"))
	if errors.Is(err, ErrNotFound) {
		httpx.Error(w, http.StatusNotFound, "region not found")
		return
	}
	if err != nil {
		fail(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusOK, d)
}

func (h *Handler) coverage(w http.ResponseWriter, r *http.Request) {
	c, err := h.svc.Coverage(r.Context())
	if err != nil {
		fail(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusOK, c)
}
