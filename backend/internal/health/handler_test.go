package health

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
)

type fakeChecker struct{ report Report }

func (f fakeChecker) Check(context.Context) Report { return f.report }

func TestHandlerGet(t *testing.T) {
	tests := []struct {
		name       string
		report     Report
		wantStatus int
	}{
		{"ok", Report{Status: StatusOK, Database: StatusOK, MigrationVersion: 1}, http.StatusOK},
		{"down", Report{Status: StatusDown, Database: StatusDown}, http.StatusServiceUnavailable},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			r := chi.NewRouter()
			NewHandler(fakeChecker{tt.report}).Routes(r)

			rec := httptest.NewRecorder()
			r.ServeHTTP(rec, httptest.NewRequestWithContext(t.Context(), http.MethodGet, "/health", nil))

			if rec.Code != tt.wantStatus {
				t.Fatalf("status = %d, want %d", rec.Code, tt.wantStatus)
			}
			if ct := rec.Header().Get("Content-Type"); ct != "application/json" {
				t.Errorf("Content-Type = %q, want application/json", ct)
			}
			var got Report
			if err := json.NewDecoder(rec.Body).Decode(&got); err != nil {
				t.Fatalf("decode body: %v", err)
			}
			if got != tt.report {
				t.Errorf("body = %+v, want %+v", got, tt.report)
			}
		})
	}
}
