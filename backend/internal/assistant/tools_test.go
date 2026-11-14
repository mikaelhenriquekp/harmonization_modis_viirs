package assistant

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/nasa-challenge/app/backend/internal/calendar"
	"github.com/nasa-challenge/app/backend/internal/firemap"
	"github.com/nasa-challenge/app/backend/internal/geo"
	"github.com/nasa-challenge/app/backend/internal/harmonize"
	"github.com/nasa-challenge/app/backend/internal/regions"
)

type fakeData struct {
	area     geo.Area
	from, to harmonize.Month
	month    harmonize.Month
}

func (f *fakeData) Calendar(_ context.Context, a geo.Area, from, to harmonize.Month) (calendar.Response, error) {
	f.area, f.from, f.to = a, from, to
	var totals []calendar.MonthTotal
	for _, m := range harmonize.MonthRange(from, to) {
		totals = append(totals, calendar.MonthTotal{Month: m, Hotspots: float64(10 + m.Calendar()*m.Calendar()), Source: "viirs_snpp"})
	}
	cal := calendar.Build(totals, calendar.Query{From: from, To: to, Now: fixedNow()})
	return calendar.Response{Calendar: cal, Notes: []string{"a caveat"}}, nil
}

func (f *fakeData) Sensors(_ context.Context, _ geo.Area, from, to harmonize.Month) (calendar.SensorsResponse, error) {
	f.from, f.to = from, to
	return calendar.SensorsResponse{Months: []calendar.SensorMonth{
		{Month: "2015-07", Aqua: 10, SNPP: 40, Harmonized: 40},
		{Month: "2015-08", Aqua: 5, SNPP: 20, Harmonized: 20},
		{Month: "2016-01", Aqua: 1, SNPP: 4, Harmonized: 4},
	}}, nil
}

func (f *fakeData) Map(_ context.Context, a geo.Area, from, to harmonize.Month, _ float64) (firemap.Response, error) {
	f.area, f.from, f.to = a, from, to
	cells := [][4]float64{{0.5, 0.5, 3, 0}, {1.5, 1.5, 9, 0}, {2.5, 2.5, 1, 0}}
	return firemap.Response{From: from.String(), To: to.String(), Cells: cells, Total: 13}, nil
}

func (f *fakeData) Anomalies(_ context.Context, _ geo.Area, m harmonize.Month, _ float64) (firemap.AnomalyResponse, error) {
	f.month = m
	md := func(v float64) *float64 { return &v }
	return firemap.AnomalyResponse{Month: m.String(), Counts: map[string]int{"much_above": 1}, Cells: []firemap.Anomaly{
		{Lat: 1, Lon: 1, Projected: 20, Median: md(18), Status: "normal"},
		{Lat: 41, Lon: 23, Projected: 500, Median: md(50), Status: "much_above"},
	}}, nil
}

func (f *fakeData) LastDay(context.Context) (time.Time, error) {
	return time.Date(2026, 11, 12, 0, 0, 0, 0, time.UTC), nil
}

func (f *fakeData) List(context.Context) ([]regions.Summary, error) {
	return []regions.Summary{{ID: "ESP", Name: "Spain", Status: "ok"}, {ID: "GRC", Name: "Greece", Status: "ok"}}, nil
}

func (f *fakeData) Get(_ context.Context, id string) (regions.Detail, error) {
	if id != "ESP" {
		return regions.Detail{}, regions.ErrNotFound
	}
	return regions.Detail{Summary: regions.Summary{ID: "ESP", Name: "Spain"}}, nil
}

func (f *fakeData) Coverage(context.Context) (regions.Coverage, error) {
	return regions.Coverage{DataStart: "2002-07"}, nil
}

func tool(t *testing.T, f *fakeData, name string) Tool {
	t.Helper()
	for _, tl := range NewTools(f, f, f, fixedNow) {
		if tl.Spec().Name == name {
			return tl
		}
	}
	t.Fatalf("no tool %s", name)
	return nil
}

func call(t *testing.T, tl Tool, args string) (map[string]any, *Card, error) {
	t.Helper()
	res, err := tl.Call(t.Context(), json.RawMessage(args))
	if err != nil {
		return nil, nil, err
	}
	b, _ := json.Marshal(res.ForModel)
	var out map[string]any
	_ = json.Unmarshal(b, &out)
	return out, res.Card, nil
}

func TestToolSpecsAreValidJSONSchemas(t *testing.T) {
	for _, tl := range NewTools(&fakeData{}, &fakeData{}, &fakeData{}, nil) {
		s := tl.Spec()
		var v map[string]any
		if err := json.Unmarshal(s.Parameters, &v); err != nil || v["type"] != "object" {
			t.Errorf("%s parameters: %v %v", s.Name, err, v)
		}
		if s.Description == "" {
			t.Errorf("%s has no description", s.Name)
		}
	}
}

func TestAreaArgParse(t *testing.T) {
	f := func(v float64) *float64 { return &v }
	tests := []struct {
		name       string
		arg        *AreaArg
		wantSearch string
		wantErr    bool
	}{
		{"nil is the world", nil, "world", false},
		{"bbox", &AreaArg{Kind: "bbox", West: f(-9.6), South: f(35.9), East: f(4.4), North: f(43.9)}, "bbox:-9.6,35.9,4.4,43.9", false},
		{"point default radius", &AreaArg{Kind: "point", Lat: f(38), Lon: f(-1.1)}, "point:38,-1.1,25", false},
		{"polygon", &AreaArg{Kind: "polygon", Points: [][2]float64{{0, 0}, {1, 0}, {1, 1}}}, "polygon:0,0,1,0,1,1", false},
		{"bbox missing a side", &AreaArg{Kind: "bbox", West: f(1)}, "", true},
		{"upside down", &AreaArg{Kind: "bbox", West: f(0), South: f(10), East: f(1), North: f(5)}, "", true},
		{"unknown kind", &AreaArg{Kind: "circle"}, "", true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, search, err := tt.arg.Parse()
			if (err != nil) != tt.wantErr || search != tt.wantSearch {
				t.Errorf("Parse = %q, %v; want %q, err=%v", search, err, tt.wantSearch, tt.wantErr)
			}
			if err != nil && !errors.Is(err, geo.ErrInvalidArea) {
				t.Errorf("error %v is not ErrInvalidArea", err)
			}
		})
	}
}

func TestCalendarTool(t *testing.T) {
	f := &fakeData{}
	out, card, err := call(t, tool(t, f, "get_calendar"),
		`{"area":{"kind":"bbox","name":"Iberia","west":-9.6,"south":35.9,"east":4.4,"north":43.9},"from":"2015-01","to":"2020-12"}`)
	if err != nil {
		t.Fatal(err)
	}
	if f.from != calendar.FirstMonth || f.to.String() != "2020-12" || f.area.World {
		t.Errorf("asked for %s..%s world=%v, want the whole record up to 2020-12", f.from, f.to, f.area.World)
	}
	if out["area"] != "Iberia" || out["from"] != "2015-01" || len(out["last_24_months"].([]any)) != 24 ||
		len(out["busiest_years"].([]any)) != 5 || len(out["years"].([]any)) != 6 {
		t.Errorf("summary = %v", out)
	}
	ytd := out["year_to_date"].(map[string]any)
	if ytd["year"].(float64) != 2020 || ytd["years_compared"].(float64) != 17 || ytd["status"] != "normal" {
		t.Errorf("year to date = %v", ytd)
	}
	if card == nil || card.Kind != "calendar" || card.Area != "bbox:-9.6,35.9,4.4,43.9" {
		t.Errorf("card = %+v", card)
	}
}

func TestPeriodToolsRejectBadArgs(t *testing.T) {
	for _, tt := range []struct{ tool, args string }{
		{"get_calendar", `{"area":{"kind":"world"},"from":"2015-13"}`},
		{"get_calendar", `{"area":{"kind":"world"},"to":"2099-01"}`},
		{"get_sensors", `{"area":{"kind":"bbox"}}`},
		{"get_fire_map", `not json`},
		{"get_anomalies", `{"month":"1999-01"}`},
		{"find_region", `{"query":" "}`},
		{"get_region", `{"id":"XXX"}`},
	} {
		if _, _, err := call(t, tool(t, &fakeData{}, tt.tool), tt.args); !errors.Is(err, ErrBadArgs) {
			t.Errorf("%s(%s) = %v, want ErrBadArgs", tt.tool, tt.args, err)
		}
	}
}

func TestAnomaliesToolDefaultsToTheLastMonthAndRanksByExcess(t *testing.T) {
	f := &fakeData{}
	out, card, err := call(t, tool(t, f, "get_anomalies"), `{}`)
	if err != nil {
		t.Fatal(err)
	}
	if f.month.String() != "2026-11" {
		t.Errorf("month = %s, want the last day's", f.month)
	}
	top := out["most_unusual_cells"].([]any)[0].(map[string]any)
	if top["lat"].(float64) != 41 || card.Kind != "anomalies" {
		t.Errorf("first cell = %v, card %+v", top, card)
	}
}

func TestFireMapToolRanksCells(t *testing.T) {
	out, _, err := call(t, tool(t, &fakeData{}, "get_fire_map"), `{"from":"2025-01","to":"2025-12"}`)
	if err != nil {
		t.Fatal(err)
	}
	top := out["top_cells"].([]any)
	if top[0].(map[string]any)["hotspots"].(float64) != 9 || out["total_hotspots"].(float64) != 13 {
		t.Errorf("out = %v", out)
	}
}

func TestSensorsToolSumsYears(t *testing.T) {
	out, _, err := call(t, tool(t, &fakeData{}, "get_sensors"), `{"area":{"kind":"world"}}`)
	if err != nil {
		t.Fatal(err)
	}
	years := out["years"].([]any)
	first := years[0].(map[string]any)
	if len(years) != 2 || first["aqua"].(float64) != 15 || first["snpp"].(float64) != 60 {
		t.Errorf("years = %v", years)
	}
}

func TestFindRegion(t *testing.T) {
	out, _, err := call(t, tool(t, &fakeData{}, "find_region"), `{"query":"spa"}`)
	if err != nil {
		t.Fatal(err)
	}
	m := out["matches"].([]any)
	if len(m) != 1 || m[0].(map[string]any)["id"] != "ESP" {
		t.Errorf("matches = %v", m)
	}
	out, _, _ = call(t, tool(t, &fakeData{}, "find_region"), `{"query":"atlantis"}`)
	if !strings.Contains(out["hint"].(string), "bbox") {
		t.Errorf("no match = %v", out)
	}
}
