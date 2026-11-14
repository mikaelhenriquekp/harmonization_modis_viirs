// Package server wires HTTP routing and middleware.
package server

import (
	"log/slog"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"

	"github.com/nasa-challenge/app/backend/internal/httpx"
)

// RouteRegistrar is implemented by feature handlers that mount their routes.
type RouteRegistrar interface {
	Routes(r chi.Router)
}

// NewRouter builds the root router; every feature is mounted under /api.
func NewRouter(log *slog.Logger, features ...RouteRegistrar) http.Handler {
	r := chi.NewRouter()

	r.Use(middleware.RequestID)
	r.Use(requestLogger(log))
	r.Use(middleware.Recoverer)
	r.Use(timeoutExcept(30*time.Second, streamingPaths))

	r.Route("/api", func(api chi.Router) {
		for _, f := range features {
			f.Routes(api)
		}
	})

	r.NotFound(func(w http.ResponseWriter, _ *http.Request) {
		httpx.Error(w, http.StatusNotFound, "not found")
	})

	return r
}

// streamingPaths answer for longer than the request timeout and bound
// themselves (the assistant streams its answer).
var streamingPaths = map[string]bool{"/api/assistant/chat": true}

func timeoutExcept(d time.Duration, skip map[string]bool) func(http.Handler) http.Handler {
	timeout := middleware.Timeout(d)
	return func(next http.Handler) http.Handler {
		limited := timeout(next)
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if skip[r.URL.Path] {
				next.ServeHTTP(w, r)
				return
			}
			limited.ServeHTTP(w, r)
		})
	}
}

func requestLogger(log *slog.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			start := time.Now()
			ww := middleware.NewWrapResponseWriter(w, r.ProtoMajor)
			next.ServeHTTP(ww, r)
			log.InfoContext(r.Context(), "http request",
				"method", r.Method,
				"path", r.URL.Path,
				"status", ww.Status(),
				"bytes", ww.BytesWritten(),
				"duration", time.Since(start),
				"request_id", middleware.GetReqID(r.Context()),
			)
		})
	}
}
