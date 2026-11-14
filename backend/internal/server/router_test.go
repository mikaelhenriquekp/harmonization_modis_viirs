package server

import (
	"context"
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
		h.ServeHTTP(rec, httptest.NewRequestWithContext(t.Context(), http.MethodGet, path, nil))
		if rec.Code != want {
			t.Errorf("GET %s = %d, want %d", path, rec.Code, want)
		}
	}
}

type slowFeature struct{}

func (slowFeature) Routes(r chi.Router) {
	deadline := func(w http.ResponseWriter, r *http.Request) {
		if _, ok := r.Context().Deadline(); ok {
			w.WriteHeader(http.StatusOK)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
	r.Get("/calendar", deadline)
	r.Post("/assistant/chat", deadline)
}

func TestRouterTimeoutSkipsTheStreamingChat(t *testing.T) {
	h := NewRouter(slog.New(slog.NewTextHandler(io.Discard, nil)), slowFeature{})
	tests := []struct {
		method, path string
		want         int
	}{
		{http.MethodGet, "/api/calendar", http.StatusOK},               // has the router's deadline
		{http.MethodPost, "/api/assistant/chat", http.StatusNoContent}, // bounds itself
	}
	for _, tt := range tests {
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, httptest.NewRequestWithContext(context.Background(), tt.method, tt.path, nil))
		if rec.Code != tt.want {
			t.Errorf("%s %s = %d, want %d", tt.method, tt.path, rec.Code, tt.want)
		}
	}
}
