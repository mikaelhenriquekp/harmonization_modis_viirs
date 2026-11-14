package calendar

import (
	"context"
	"encoding/csv"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"

	"github.com/nasa-challenge/app/backend/internal/geo"
	"github.com/nasa-challenge/app/backend/internal/harmonize"
)

type fakeService struct {
	from, to harmonize.Month
	area     geo.Area
	err      error
}

func (f *fakeService) Calendar(_ context.Context, a geo.Area, from, to harmonize.Month) (Response, error) {
	f.area, f.from, f.to = a, from, to
	cal := Build(history("2026-10"), Query{From: from, To: to, Now: fixedNow()})
	return Response{Calendar: cal, Attribution: Attribution}, f.err
}

func (f *fakeService) Sensors(_ context.Context, a geo.Area, from, to harmonize.Month) (SensorsResponse, error) {
	f.area, f.from, f.to = a, from, to
	return SensorsResponse{Months: []SensorMonth{{Month: "2015-08", Aqua: 1, SNPP: 4, Harmonized: 4}}}, f.err
}

func serve(t *testing.T, svc *fakeService, target string) *httptest.ResponseRecorder {
	t.Helper()
	r := chi.NewRouter()
	NewHandler(svc, fixedNow).Routes(r)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequestWithContext(t.Context(), http.MethodGet, target, nil))
	return rec
}

func TestHandlerCalendar(t *testing.T) {
	tests := []struct {
		name       string
		target     string
		svcErr     error
		wantStatus int
		wantFrom   string
		wantTo     string
	}{
		{"defaults to the whole record", "/calendar?bbox=-2,37,-1,38", nil, http.StatusOK, "2002-07", "2026-11"},
		{"explicit range", "/calendar?lat=38&lon=-1.1&from=2010-01&to=2012-12", nil, http.StatusOK, "2010-01", "2012-12"},
		{"bad month", "/calendar?from=2010-13", nil, http.StatusBadRequest, "", ""},
		{"from after to", "/calendar?from=2012-01&to=2010-01", nil, http.StatusBadRequest, "", ""},
		{"bad area", "/calendar?bbox=1,2", nil, http.StatusBadRequest, "", ""},
		{"future", "/calendar?to=2030-01", nil, http.StatusBadRequest, "", ""},
		{"service fails", "/calendar", errors.New("db down"), http.StatusInternalServerError, "", ""},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			svc := &fakeService{err: tt.svcErr}
			rec := serve(t, svc, tt.target)
			if rec.Code != tt.wantStatus {
				t.Fatalf("status = %d, want %d: %s", rec.Code, tt.wantStatus, rec.Body)
			}
			if tt.wantStatus != http.StatusOK {
				return
			}
			if svc.from.String() != tt.wantFrom || svc.to.String() != tt.wantTo {
				t.Errorf("range = %s..%s", svc.from, svc.to)
			}
			var got Response
			if err := json.NewDecoder(rec.Body).Decode(&got); err != nil {
				t.Fatal(err)
			}
			if len(got.Calendar.Months) == 0 {
				t.Error("no months")
			}
		})
	}
}

func TestHandlerCalendarCSV(t *testing.T) {
	rec := serve(t, &fakeService{}, "/calendar.csv?bbox=-2,37,-1,38&from=2020-01&to=2020-12")
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d", rec.Code)
	}
	if ct := rec.Header().Get("Content-Type"); !strings.HasPrefix(ct, "text/csv") {
		t.Errorf("Content-Type = %q", ct)
	}
	if cd := rec.Header().Get("Content-Disposition"); !strings.Contains(cd, "burning-calendar_2020-01_2020-12.csv") {
		t.Errorf("Content-Disposition = %q", cd)
	}
	rows, err := csv.NewReader(rec.Body).ReadAll()
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) != 13 || rows[0][0] != "month" || rows[8][0] != "2020-08" || rows[8][1] != "200" {
		t.Errorf("rows = %v", rows[:3])
	}
}

func TestHandlerSensors(t *testing.T) {
	rec := serve(t, &fakeService{}, "/sensors?bbox=-2,37,-1,38")
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), `"snpp":4`) {
		t.Errorf("status = %d body = %s", rec.Code, rec.Body)
	}
}
