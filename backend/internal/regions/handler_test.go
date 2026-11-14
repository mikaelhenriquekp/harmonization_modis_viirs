package regions

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
)

type fakeRepo struct {
	list   []Summary
	detail map[string]Detail
	cov    Coverage
	err    error
}

func (f fakeRepo) List(context.Context) ([]Summary, error) { return f.list, f.err }

func (f fakeRepo) Get(_ context.Context, id string) (Detail, error) {
	if f.err != nil {
		return Detail{}, f.err
	}
	d, ok := f.detail[id]
	if !ok {
		return Detail{}, ErrNotFound
	}
	return d, nil
}

func (f fakeRepo) Coverage(context.Context) (Coverage, error) { return f.cov, f.err }

func newRepo() fakeRepo {
	return fakeRepo{
		list: []Summary{
			{ID: "Spain", Name: "Spain", Status: "ok", Scope: "own", Quality: "good"},
			{ID: "Andorra", Name: "Andorra", Status: "ok", Scope: "regional", Quality: "review"},
			{ID: "Monaco", Name: "Monaco", Status: "insufficient_data"},
			{ID: "Peru", Name: "Peru", Status: "pending"},
			{ID: "Chad", Name: "Chad", Status: "error"},
		},
		detail: map[string]Detail{"Spain": {Summary: Summary{ID: "Spain", Name: "Spain", Status: "ok"}}},
		cov:    Coverage{ArchiveEnd: "2025-12"},
	}
}

func serve(t *testing.T, repo fakeRepo, target string) *httptest.ResponseRecorder {
	t.Helper()
	r := chi.NewRouter()
	NewHandler(NewService(repo)).Routes(r)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequestWithContext(t.Context(), http.MethodGet, target, nil))
	return rec
}

func TestHandler(t *testing.T) {
	boom := fakeRepo{err: errors.New("boom")}
	tests := []struct {
		name   string
		repo   fakeRepo
		target string
		want   int
	}{
		{"list", newRepo(), "/regions", http.StatusOK},
		{"detail", newRepo(), "/regions/Spain", http.StatusOK},
		{"unknown region", newRepo(), "/regions/Atlantis", http.StatusNotFound},
		{"coverage", newRepo(), "/coverage", http.StatusOK},
		{"list fails", boom, "/regions", http.StatusInternalServerError},
		{"detail fails", boom, "/regions/Spain", http.StatusInternalServerError},
		{"coverage fails", boom, "/coverage", http.StatusInternalServerError},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if rec := serve(t, tt.repo, tt.target); rec.Code != tt.want {
				t.Errorf("status = %d, want %d: %s", rec.Code, tt.want, rec.Body)
			}
		})
	}
}

func TestCoverageCountsRegions(t *testing.T) {
	rec := serve(t, newRepo(), "/coverage")
	var got Coverage
	if err := json.NewDecoder(rec.Body).Decode(&got); err != nil {
		t.Fatal(err)
	}
	want := Counts{Total: 5, Harmonized: 2, Own: 1, Regional: 1, Insufficient: 1, Pending: 1, Error: 1}
	if got.Regions != want || got.ArchiveEnd != "2025-12" || got.DataStart != "2002-07" || got.Attribution == "" {
		t.Errorf("coverage = %+v", got)
	}
}
