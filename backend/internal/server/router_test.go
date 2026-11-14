package server

import (
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
)

type pingFeature struct{}

func (pingFeature) Routes(r chi.Router) {
	r.Get("/ping", func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusNoContent) })
}

func TestRouterMountsFeaturesUnderAPI(t *testing.T) {
	h := NewRouter(slog.New(slog.NewTextHandler(io.Discard, nil)), pingFeature{})

	tests := map[string]int{
		"/api/ping": http.StatusNoContent,
		"/ping":     http.StatusNotFound,
	}
	for path, want := range tests {
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, path, nil))
		if rec.Code != want {
			t.Errorf("GET %s = %d, want %d", path, rec.Code, want)
		}
	}
}
