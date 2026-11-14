package hotspots

import (
	"context"
	"encoding/csv"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/nasa-challenge/app/backend/internal/firms"
	"github.com/nasa-challenge/app/backend/internal/harmonize"
)

type fakeService struct {
	q   Query
	err error
}

func (f *fakeService) Fetch(_ context.Context, q Query) ([]Row, error) {
	f.q = q
	if f.err != nil {
		return nil, f.err
	}
	return []Row{{Source: "VIIRS_SNPP_SP", Detection: harmonize.Detection{Lat: 38.1, Lon: -1.1, Date: "2020-08-01", Time: 155,
		Satellite: harmonize.SNPP, Confidence: "n", FRP: 2.5, Scan: 0.4, Track: 0.4, DayNight: 'N', HasType: true}}}, nil
}

func (f *fakeService) Validate(Query) error { return nil }

func serve(t *testing.T, svc Fetcherer, target string) *httptest.ResponseRecorder {
	t.Helper()
	r := chi.NewRouter()
	NewHandler(svc, func() time.Time { return day("2026-11-14") }).Routes(r)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequestWithContext(t.Context(), http.MethodGet, target, nil))
	return rec
}

func TestHandlerCSV(t *testing.T) {
	svc := &fakeService{}
	rec := serve(t, svc, "/hotspots.csv?bbox=-2,37,-1,39&from=2020-08-01&to=2020-08-31")
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d: %s", rec.Code, rec.Body)
	}
	if cd := rec.Header().Get("Content-Disposition"); !strings.Contains(cd, "hotspots_2020-08-01_2020-08-31.csv") {
		t.Errorf("Content-Disposition = %q", cd)
	}
	rows, err := csv.NewReader(rec.Body).ReadAll()
	if err != nil {
		t.Fatal(err)
	}
	want := []string{"latitude", "longitude", "acq_date", "acq_time", "satellite", "instrument", "confidence", "frp", "scan", "track", "daynight", "type", "provisional", "source"}
	if strings.Join(rows[0], ",") != strings.Join(want, ",") {
		t.Errorf("header = %v", rows[0])
	}
	if strings.Join(rows[1], ",") != "38.1,-1.1,2020-08-01,0155,SNPP,VIIRS,n,2.5,0.4,0.4,N,0,false,VIIRS_SNPP_SP" {
		t.Errorf("row = %v", rows[1])
	}
}

func TestHandlerDefaultsAndErrors(t *testing.T) {
	svc := &fakeService{}
	if rec := serve(t, svc, "/hotspots.csv?lat=38&lon=-1"); rec.Code != http.StatusOK {
		t.Fatalf("status = %d", rec.Code)
	}
	if svc.q.To != day("2026-11-14") || svc.q.From != day("2026-11-08") || svc.q.All {
		t.Errorf("defaults = %+v", svc.q)
	}
	if rec := serve(t, svc, "/hotspots.csv?all=true&from=2026-11-01&to=2026-11-02"); rec.Code != http.StatusOK || !svc.q.All {
		t.Errorf("all = %v", svc.q.All)
	}
	tests := []struct {
		name   string
		target string
		err    error
		want   int
	}{
		{"bad date", "/hotspots.csv?from=2020-13-01", nil, http.StatusBadRequest},
		{"future", "/hotspots.csv?to=2027-01-01", nil, http.StatusBadRequest},
		{"bad area", "/hotspots.csv?bbox=1", nil, http.StatusBadRequest},
		{"too long", "/hotspots.csv", ErrInvalid, http.StatusBadRequest},
		{"key busy", "/hotspots.csv", firms.ErrLimit, http.StatusServiceUnavailable},
		{"firms down", "/hotspots", errors.New("timeout"), http.StatusBadGateway},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if rec := serve(t, &fakeService{err: tt.err}, tt.target); rec.Code != tt.want {
				t.Errorf("status = %d, want %d", rec.Code, tt.want)
			}
		})
	}
	if rec := serve(t, nil, "/hotspots.csv"); rec.Code != http.StatusServiceUnavailable {
		t.Errorf("without a map key: status = %d", rec.Code)
	}
}

func TestHandlerJSON(t *testing.T) {
	rec := serve(t, &fakeService{}, "/hotspots?bbox=-2,37,-1,39&from=2020-08-01&to=2020-08-02")
	var got struct {
		Columns []string `json:"columns"`
		Rows    [][]any  `json:"rows"`
		Count   int      `json:"count"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&got); err != nil {
		t.Fatal(err)
	}
	if got.Count != 1 || len(got.Rows[0]) != len(got.Columns) {
		t.Errorf("got %+v", got)
	}
}
