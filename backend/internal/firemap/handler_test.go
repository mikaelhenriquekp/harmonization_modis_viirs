package firemap

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/nasa-challenge/app/backend/internal/geo"
	"github.com/nasa-challenge/app/backend/internal/harmonize"
)

type fakeRepo struct {
	factor   int
	from, to harmonize.Month
	month    harmonize.Month
	last     time.Time
	cells    []Cell
	err      error
}

func (f *fakeRepo) Cells(_ context.Context, _ geo.Area, from, to harmonize.Month, factor int) ([]Cell, error) {
	f.from, f.to, f.factor = from, to, factor
	return f.cells, f.err
}

func now() time.Time { return time.Date(2026, 11, 14, 0, 0, 0, 0, time.UTC) }

func serve(t *testing.T, repo *fakeRepo, target string) *httptest.ResponseRecorder {
	t.Helper()
	r := chi.NewRouter()
	NewHandler(NewService(repo), now).Routes(r)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequestWithContext(t.Context(), http.MethodGet, target, nil))
	return rec
}

func TestHandler(t *testing.T) {
	tests := []struct {
		name       string
		target     string
		err        error
		want       int
		wantFactor int
		wantFrom   string
	}{
		{"defaults to the current month at 1 degree", "/map", nil, http.StatusOK, 4, "2026-11"},
		{"fine grid", "/map?resolution=0.25&from=2017-10&to=2017-10&bbox=-10,36,4,44", nil, http.StatusOK, 1, "2017-10"},
		{"coarse grid", "/map?resolution=2&from=2020-01&to=2020-12", nil, http.StatusOK, 8, "2020-01"},
		{"unsupported resolution", "/map?resolution=0.3", nil, http.StatusBadRequest, 0, ""},
		{"bad range", "/map?from=2020-05&to=2020-01", nil, http.StatusBadRequest, 0, ""},
		{"repository fails", "/map", errors.New("boom"), http.StatusInternalServerError, 0, ""},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			repo := &fakeRepo{err: tt.err, cells: []Cell{{I: 152, J: -5, Hotspots: 10, FRP: 50}, {I: 10, J: 10, Hotspots: 2}}}
			rec := serve(t, repo, tt.target)
			if rec.Code != tt.want {
				t.Fatalf("status = %d, want %d: %s", rec.Code, tt.want, rec.Body)
			}
			if tt.want != http.StatusOK {
				return
			}
			if repo.factor != tt.wantFactor || repo.from.String() != tt.wantFrom {
				t.Errorf("factor = %d from = %s", repo.factor, repo.from)
			}
			var got Response
			if err := json.NewDecoder(rec.Body).Decode(&got); err != nil {
				t.Fatal(err)
			}
			if got.Total != 12 || got.Max != 10 || len(got.Cells) != 2 {
				t.Errorf("got %+v", got)
			}
		})
	}
}

func TestCellCenters(t *testing.T) {
	svc := NewService(&fakeRepo{cells: []Cell{{I: 38, J: -2, Hotspots: 3}}})
	got, err := svc.Map(context.Background(), geo.Area{LatMin: -360, LatMax: 359, Lon: [][2]int16{{-720, 719}}}, 0, 0, 1)
	if err != nil {
		t.Fatal(err)
	}
	if c := got.Cells[0]; c[0] != 38.5 || c[1] != -1.5 || c[2] != 3 {
		t.Errorf("cell = %v (1° cell 38,-2 is centered at 38.5,-1.5)", c)
	}
}
