// Package docs serves the OpenAPI document.
package docs

import (
	"net/http"

	"github.com/go-chi/chi/v5"
)

// Handler serves the OpenAPI document.
type Handler struct {
	doc []byte
}

// NewHandler builds a docs Handler.
func NewHandler(doc []byte) *Handler { return &Handler{doc: doc} }

// Routes mounts the docs routes.
func (h *Handler) Routes(r chi.Router) {
	r.Get("/openapi.yaml", h.get)
}

func (h *Handler) get(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "application/yaml; charset=utf-8")
	_, _ = w.Write(h.doc)
}
