package docs

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
)

func TestServesTheDocument(t *testing.T) {
	r := chi.NewRouter()
	NewHandler([]byte("openapi: 3.1.0\n")).Routes(r)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequestWithContext(t.Context(), http.MethodGet, "/openapi.yaml", nil))
	if rec.Code != http.StatusOK || !strings.HasPrefix(rec.Header().Get("Content-Type"), "application/yaml") || rec.Body.String() != "openapi: 3.1.0\n" {
		t.Errorf("status = %d, type = %q, body = %q", rec.Code, rec.Header().Get("Content-Type"), rec.Body)
	}
}
