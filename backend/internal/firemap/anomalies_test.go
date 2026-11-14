package firemap

import (
	"context"
	"encoding/json"
	"net/http"
	"net/url"
	"testing"
	"time"

	"github.com/nasa-challenge/app/backend/internal/calendar"
	"github.com/nasa-challenge/app/backend/internal/geo"
	"github.com/nasa-challenge/app/backend/internal/harmonize"
)

// sameMonth returns, for every November, 10 hotspots in a "normal" cell, a
// growing count in a "burning" cell that explodes this year, and one cell
// that only burned once long ago.
func sameMonth(year int) []CellYear {
	var out []CellYear
	for y := 2002; y <= year; y++ {
		out = append(out, CellYear{I: 38, J: -2, Year: y, Hotspots: 10})
		v := float64(y - 2000)
		if y == year {
			v = 500
		}
		out = append(out, CellYear{I: 40, J: 20, Year: y, Hotspots: v})
	}
	out = append(out, CellYear{I: -10, J: 30, Year: 2005, Hotspots: 3})
	return out
}

func (f *fakeRepo) SameMonth(_ context.Context, _ geo.Area, m harmonize.Month, factor int) ([]CellYear, error) {
	f.month, f.factor = m, factor
	return sameMonth(m.Year()), f.err
}

func world(t *testing.T) geo.Area {
	t.Helper()
	a, err := geo.ParseArea(url.Values{})
	if err != nil {
		t.Fatal(err)
	}
	return a
}

func (f *fakeRepo) LastDay(context.Context) (time.Time, error) { return f.last, f.err }

func TestAnomaliesPerCell(t *testing.T) {
	repo := &fakeRepo{last: time.Date(2026, 11, 14, 0, 0, 0, 0, time.UTC)}
	got, err := NewService(repo).Anomalies(t.Context(), world(t), harmonize.MustMonth("2026-11"), 1)
	if err != nil {
		t.Fatal(err)
	}
	if got.Month != "2026-11" || got.YearsCompared != 24 || got.ElapsedFraction != 0.467 || got.DataUntil != "2026-11-14" {
		t.Errorf("header = %+v", got)
	}
	byCell := map[[2]float64]Anomaly{}
	for _, a := range got.Cells {
		byCell[[2]float64{a.Lat, a.Lon}] = a
	}
	normal, burning, old := byCell[[2]float64{38.5, -1.5}], byCell[[2]float64{40.5, 20.5}], byCell[[2]float64{-9.5, 30.5}]
	// 10 so far with 46.7 % of the month gone projects to 21.4: above every past November (10)
	if normal.Status != calendar.StatusMuchAbove || normal.Projected != 21.4 {
		t.Errorf("normal cell = %+v", normal)
	}
	if burning.Status != calendar.StatusMuchAbove || burning.Median == nil || *burning.Median != 13.5 {
		t.Errorf("burning cell = %+v", burning)
	}
	// burned once in 24 Novembers, nothing now: the median is 0, so it is not listed
	if _, listed := byCell[[2]float64{-9.5, 30.5}]; listed {
		t.Errorf("quiet cell listed: %+v", old)
	}
	if got.Counts[calendar.StatusMuchAbove] != 2 {
		t.Errorf("counts = %v", got.Counts)
	}
}

func TestAnomaliesOfACompleteMonth(t *testing.T) {
	repo := &fakeRepo{last: time.Date(2026, 11, 14, 0, 0, 0, 0, time.UTC)}
	got, err := NewService(repo).Anomalies(t.Context(), world(t), harmonize.MustMonth("2025-11"), 1)
	if err != nil {
		t.Fatal(err)
	}
	for _, a := range got.Cells {
		if a.Lat == 38.5 && (a.Status != calendar.StatusNormal || a.Projected != 10) {
			t.Errorf("a complete month is not projected: %+v", a)
		}
	}
	if got.YearsCompared != 23 || got.ElapsedFraction != 1 {
		t.Errorf("header = %+v", got)
	}
}

func TestAnomaliesHandler(t *testing.T) {
	tests := []struct {
		name      string
		target    string
		want      int
		wantMonth string
	}{
		{"defaults to the last month with data", "/map/anomalies", http.StatusOK, "2026-11"},
		{"explicit month", "/map/anomalies?month=2025-08&resolution=2", http.StatusOK, "2025-08"},
		{"after the data", "/map/anomalies?month=2026-12", http.StatusBadRequest, ""},
		{"before the record", "/map/anomalies?month=2001-01", http.StatusBadRequest, ""},
		{"bad month", "/map/anomalies?month=11-2026", http.StatusBadRequest, ""},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			repo := &fakeRepo{last: time.Date(2026, 11, 14, 0, 0, 0, 0, time.UTC)}
			rec := serve(t, repo, tt.target)
			if rec.Code != tt.want {
				t.Fatalf("status = %d: %s", rec.Code, rec.Body)
			}
			if tt.want != http.StatusOK {
				return
			}
			var got AnomalyResponse
			if err := json.NewDecoder(rec.Body).Decode(&got); err != nil {
				t.Fatal(err)
			}
			if got.Month != tt.wantMonth || repo.month.String() != tt.wantMonth {
				t.Errorf("month = %s / %s", got.Month, repo.month)
			}
		})
	}
}

func TestCellWithoutPastFireHasNoHistory(t *testing.T) {
	repo := &newCellRepo{fakeRepo{last: time.Date(2026, 11, 14, 0, 0, 0, 0, time.UTC)}}
	got, err := NewService(repo).Anomalies(t.Context(), world(t), harmonize.MustMonth("2026-11"), 1)
	if err != nil {
		t.Fatal(err)
	}
	if len(got.Cells) != 1 || got.Cells[0].Status != calendar.StatusNoHistory {
		t.Errorf("cells = %+v (fire where none was ever recorded, e.g. outside the harmonized countries)", got.Cells)
	}
}

type newCellRepo struct{ fakeRepo }

func (r *newCellRepo) SameMonth(context.Context, geo.Area, harmonize.Month, int) ([]CellYear, error) {
	return []CellYear{{I: 1, J: 1, Year: 2026, Hotspots: 8}}, nil
}
