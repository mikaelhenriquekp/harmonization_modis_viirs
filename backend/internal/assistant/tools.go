package assistant

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"net/url"
	"sort"
	"strings"
	"time"

	"github.com/nasa-challenge/app/backend/internal/calendar"
	"github.com/nasa-challenge/app/backend/internal/firemap"
	"github.com/nasa-challenge/app/backend/internal/geo"
	"github.com/nasa-challenge/app/backend/internal/harmonize"
	"github.com/nasa-challenge/app/backend/internal/regions"
)

// Calendars is what the tools need from the calendar service.
type Calendars interface {
	Calendar(ctx context.Context, a geo.Area, from, to harmonize.Month) (calendar.Response, error)
	Sensors(ctx context.Context, a geo.Area, from, to harmonize.Month) (calendar.SensorsResponse, error)
}

// Maps is what the tools need from the fire map service.
type Maps interface {
	Map(ctx context.Context, a geo.Area, from, to harmonize.Month, resolution float64) (firemap.Response, error)
	Anomalies(ctx context.Context, a geo.Area, m harmonize.Month, resolution float64) (firemap.AnomalyResponse, error)
	LastDay(ctx context.Context) (time.Time, error)
}

// Regions is what the tools need from the regions service.
type Regions interface {
	List(ctx context.Context) ([]regions.Summary, error)
	Get(ctx context.Context, id string) (regions.Detail, error)
	Coverage(ctx context.Context) (regions.Coverage, error)
}

// Card is a tool result the web app draws next to the answer.
type Card struct {
	Kind  string `json:"kind"` // calendar | sensors | anomalies | hotspots | region | coverage
	Title string `json:"title"`
	Area  string `json:"area,omitempty"` // in the web app's URL form, for "open in analysis"
	From  string `json:"from,omitempty"`
	To    string `json:"to,omitempty"`
	Data  any    `json:"data"`
}

// Result is what a tool returns: a compact summary for the model and,
// optionally, a card for the user.
type Result struct {
	ForModel any
	Card     *Card
}

// Tool is something the model can call.
type Tool interface {
	Spec() ToolSpec
	Call(ctx context.Context, args json.RawMessage) (Result, error)
}

// ErrBadArgs means the model called a tool with wrong arguments; the error
// goes back to the model so it can fix the call.
var ErrBadArgs = errors.New("bad arguments")

func bad(err error) error { return fmt.Errorf("%w: %w", ErrBadArgs, err) }

func decode(args json.RawMessage, v any) error {
	if len(args) == 0 || string(args) == "null" {
		return nil
	}
	if err := json.Unmarshal(args, v); err != nil {
		return bad(err)
	}
	return nil
}

// periodArgs are the arguments shared by the period tools.
type periodArgs struct {
	Area *AreaArg `json:"area"`
	From string   `json:"from"`
	To   string   `json:"to"`
}

func (p periodArgs) parse(now time.Time) (geo.Area, string, harmonize.Month, harmonize.Month, error) {
	a, search, err := p.Area.Parse()
	if err != nil {
		return geo.Area{}, "", 0, 0, bad(err)
	}
	q := url.Values{}
	q.Set("from", p.From)
	q.Set("to", p.To)
	from, to, err := calendar.ParseRange(q, now)
	if err != nil {
		return geo.Area{}, "", 0, 0, bad(err)
	}
	return a, search, from, to, nil
}

func schema(props string, required ...string) json.RawMessage {
	req, _ := json.Marshal(required)
	if required == nil {
		req = []byte("[]")
	}
	return json.RawMessage(fmt.Sprintf(`{"type":"object","properties":{%s},"required":%s}`, props, req))
}

var periodProps = `"area": ` + string(areaSchema) + `,
  "from": {"type": "string", "description": "First month, YYYY-MM. Omit for the start of the record (2002-07)."},
  "to": {"type": "string", "description": "Last month, YYYY-MM. Omit for the current month."}`

func round(v float64) float64 { return math.Round(v) }

// ---- get_calendar ----------------------------------------------------------

type calendarTool struct {
	svc Calendars
	now func() time.Time
}

func (t calendarTool) Spec() ToolSpec {
	return ToolSpec{
		Name: "get_calendar",
		Description: "Monthly burning calendar of an area: harmonized satellite hotspot counts per month (2002-07 to now), " +
			"the typical value of each month (median of past years), yearly totals with ranks, the busiest/quietest years, " +
			"how the current month compares with past years (status, percentile, anomaly) and the year to date against the same " +
			"months of past years. Statistics always use the whole record; from/to only narrow the years and months listed. " +
			"Use for 'is it burning more than usual', 'when is the fire season', 'which year was worst', trends.",
		Parameters: schema(periodProps, "area"),
	}
}

type calendarSummary struct {
	Area        string                `json:"area"`
	From        string                `json:"from"`
	To          string                `json:"to"`
	DataUntil   string                `json:"data_until"`
	Current     *calendar.Current     `json:"current"`
	Peak        calendar.Peak         `json:"peak"`
	Climatology []map[string]any      `json:"typical_month"`
	TopYears    []calendar.YearStat   `json:"busiest_years"`
	Years       []map[string]any      `json:"years"`
	Recent      []map[string]any      `json:"last_24_months"`
	YearToDate  map[string]any        `json:"year_to_date,omitempty"`
	Regions     []calendar.RegionNote `json:"countries_in_area"`
	Notes       []string              `json:"caveats"`
}

func (t calendarTool) Call(ctx context.Context, raw json.RawMessage) (Result, error) {
	var p periodArgs
	if err := decode(raw, &p); err != nil {
		return Result{}, err
	}
	a, search, from, to, err := p.parse(t.now())
	if err != nil {
		return Result{}, err
	}
	// the typical month and the ranks need every year, whatever was asked
	res, err := t.svc.Calendar(ctx, a, calendar.FirstMonth, to)
	if err != nil {
		return Result{}, err
	}
	c := res.Calendar
	s := calendarSummary{
		Area: p.Area.Label(), From: from.String(), To: c.To, YearToDate: yearToDate(c), DataUntil: c.DataUntil, Current: c.Current, Peak: c.Peak,
		Regions: res.Regions, Notes: res.Notes,
	}
	if len(s.Regions) > 12 {
		s.Regions = s.Regions[:12]
	}
	for _, m := range c.Climatology {
		if m.Median != nil {
			s.Climatology = append(s.Climatology, map[string]any{"month": m.MonthOfYear, "median": round(*m.Median), "years": m.Years})
		}
	}
	ranked := make([]calendar.YearStat, 0, len(c.Years))
	for _, y := range c.Years {
		if y.Year < from.Year() {
			if y.Rank != nil {
				ranked = append(ranked, y)
			}
			continue
		}
		s.Years = append(s.Years, map[string]any{"year": y.Year, "hotspots": round(y.Hotspots), "complete": y.Complete})
		if y.Rank != nil {
			ranked = append(ranked, y)
		}
	}
	sort.Slice(ranked, func(i, j int) bool { return *ranked[i].Rank < *ranked[j].Rank })
	s.TopYears = ranked[:min(5, len(ranked))]
	for _, m := range c.Months[max(0, len(c.Months)-24):] {
		if harmonize.MustMonth(m.Month) < from {
			continue
		}
		row := map[string]any{"month": m.Month, "hotspots": round(m.Hotspots)}
		if m.Median != nil {
			row["usual"] = round(*m.Median)
		}
		if m.AnomalyPct != nil {
			row["anomaly_pct"] = round(*m.AnomalyPct)
		}
		if m.Incomplete {
			row["incomplete"] = true
		}
		s.Recent = append(s.Recent, row)
	}
	card := &Card{Kind: "calendar", Title: p.Area.Label(), Area: search, From: c.From, To: c.To, Data: map[string]any{
		"grid": c.Grid, "current": c.Current, "peak": c.Peak, "years": c.Years, "scale": c.Scale, "data_until": c.DataUntil,
	}}
	return Result{ForModel: s, Card: card}, nil
}

// yearToDate compares the last year's months so far with the same months of
// every earlier year.
func yearToDate(c calendar.Calendar) map[string]any {
	if len(c.Months) == 0 {
		return nil
	}
	last := c.Months[len(c.Months)-1]
	sums := map[int]float64{}
	for _, m := range c.Months {
		if m.MonthOfYear <= last.MonthOfYear {
			sums[m.Year] += m.Hotspots
		}
	}
	var past []float64
	for y, v := range sums {
		// only years with all those months in the record
		if y < last.Year && harmonize.NewMonth(y, 1) >= calendar.FirstMonth {
			past = append(past, v)
		}
	}
	cmp := calendar.Compare(past, sums[last.Year])
	out := map[string]any{"year": last.Year, "through_month": last.Month, "hotspots": round(sums[last.Year]),
		"years_compared": len(past), "rank": cmp.Rank, "status": cmp.Status, "last_month_incomplete": last.Incomplete}
	if cmp.Median != nil {
		out["usual"] = round(*cmp.Median)
	}
	if cmp.AnomalyPct != nil {
		out["anomaly_pct"] = round(*cmp.AnomalyPct)
	}
	return out
}

// ---- get_sensors -----------------------------------------------------------

type sensorsTool struct {
	svc Calendars
	now func() time.Time
}

func (t sensorsTool) Spec() ToolSpec {
	return ToolSpec{
		Name: "get_sensors",
		Description: "Raw hotspot counts of each satellite (MODIS Aqua, VIIRS Suomi NPP, VIIRS NOAA-20) next to the harmonized series, " +
			"per year, and the ratios between sensors. Use to explain why the raw record jumps in 2012 when VIIRS arrives, " +
			"and what the harmonization corrects.",
		Parameters: schema(periodProps, "area"),
	}
}

func (t sensorsTool) Call(ctx context.Context, raw json.RawMessage) (Result, error) {
	var p periodArgs
	if err := decode(raw, &p); err != nil {
		return Result{}, err
	}
	a, search, from, to, err := p.parse(t.now())
	if err != nil {
		return Result{}, err
	}
	res, err := t.svc.Sensors(ctx, a, from, to)
	if err != nil {
		return Result{}, err
	}
	type year struct {
		Year       int     `json:"year"`
		Aqua       float64 `json:"aqua"`
		SNPP       float64 `json:"snpp"`
		N20        float64 `json:"n20"`
		Harmonized float64 `json:"harmonized"`
	}
	var years []year
	for _, m := range res.Months {
		y := harmonize.MustMonth(m.Month).Year()
		if len(years) == 0 || years[len(years)-1].Year != y {
			years = append(years, year{Year: y})
		}
		last := &years[len(years)-1]
		last.Aqua += m.Aqua
		last.SNPP += m.SNPP
		last.N20 += m.N20
		last.Harmonized += m.Harmonized
	}
	for i := range years {
		years[i].Aqua, years[i].SNPP = round(years[i].Aqua), round(years[i].SNPP)
		years[i].N20, years[i].Harmonized = round(years[i].N20), round(years[i].Harmonized)
	}
	out := map[string]any{"area": p.Area.Label(), "ratios": res.Ratios, "years": years,
		"note": "VIIRS (375 m) sees several times more hotspots than MODIS (1 km). Before 2012-02 the harmonized series is MODIS Aqua scaled to what VIIRS would have seen."}
	card := &Card{Kind: "sensors", Title: p.Area.Label(), Area: search, From: from.String(), To: to.String(),
		Data: map[string]any{"years": years, "ratios": res.Ratios}}
	return Result{ForModel: out, Card: card}, nil
}

// ---- get_anomalies ---------------------------------------------------------

type anomaliesTool struct{ svc Maps }

func (t anomaliesTool) Spec() ToolSpec {
	return ToolSpec{
		Name: "get_anomalies",
		Description: "Early warning map: for one month, every 2° grid cell with fire, compared with the same month of past years " +
			"(projected at the current pace if the month is not over). Returns counts per status and the most unusual places. " +
			"Use for 'where is fire unusual right now', 'hotspots of concern this month'.",
		Parameters: schema(`"area": ` + string(areaSchema) + `,
  "month": {"type": "string", "description": "YYYY-MM. Omit for the latest month with data."}`),
	}
}

func (t anomaliesTool) Call(ctx context.Context, raw json.RawMessage) (Result, error) {
	var p struct {
		Area  *AreaArg `json:"area"`
		Month string   `json:"month"`
	}
	if err := decode(raw, &p); err != nil {
		return Result{}, err
	}
	a, search, err := p.Area.Parse()
	if err != nil {
		return Result{}, bad(err)
	}
	var m harmonize.Month
	if p.Month != "" {
		if m, err = harmonize.ParseMonth(p.Month); err != nil {
			return Result{}, bad(err)
		}
	} else {
		last, err := t.svc.LastDay(ctx)
		if err != nil {
			return Result{}, err
		}
		m = harmonize.NewMonth(last.Year(), int(last.Month()))
	}
	if m < calendar.FirstMonth {
		return Result{}, bad(fmt.Errorf("the record starts in %s", calendar.FirstMonth))
	}
	res, err := t.svc.Anomalies(ctx, a, m, 2)
	if errors.Is(err, firemap.ErrNoData) {
		return Result{}, bad(err)
	}
	if err != nil {
		return Result{}, err
	}
	cells := append([]firemap.Anomaly(nil), res.Cells...)
	excess := func(c firemap.Anomaly) float64 {
		if c.Median == nil {
			return 0
		}
		return c.Projected - *c.Median
	}
	sort.Slice(cells, func(i, j int) bool { return excess(cells[i]) > excess(cells[j]) })
	top := cells[:min(10, len(cells))]
	out := map[string]any{
		"area": p.Area.Label(), "month": res.Month, "data_until": res.DataUntil, "month_elapsed": res.ElapsedFraction,
		"years_compared": res.YearsCompared, "cells_per_status": res.Counts, "most_unusual_cells": top,
		"note": "Cells are 2°x2°; lat/lon is the cell center. Reverse-geocode them yourself into country/region names.",
	}
	card := &Card{Kind: "anomalies", Title: p.Area.Label(), Area: search, From: res.Month, To: res.Month,
		Data: map[string]any{"month": res.Month, "data_until": res.DataUntil, "counts": res.Counts, "top": top}}
	return Result{ForModel: out, Card: card}, nil
}

// ---- get_fire_map ----------------------------------------------------------

type fireMapTool struct {
	svc Maps
	now func() time.Time
}

func (t fireMapTool) Spec() ToolSpec {
	return ToolSpec{
		Name: "get_fire_map",
		Description: "Where the hotspots were in a period: the total and the 1° grid cells with the most harmonized hotspots. " +
			"Use for 'where did it burn the most', comparing places inside an area.",
		Parameters: schema(periodProps, "from", "to"),
	}
}

func (t fireMapTool) Call(ctx context.Context, raw json.RawMessage) (Result, error) {
	var p periodArgs
	if err := decode(raw, &p); err != nil {
		return Result{}, err
	}
	a, search, from, to, err := p.parse(t.now())
	if err != nil {
		return Result{}, err
	}
	res, err := t.svc.Map(ctx, a, from, to, 1)
	if err != nil {
		return Result{}, err
	}
	cells := append([][4]float64(nil), res.Cells...)
	sort.Slice(cells, func(i, j int) bool { return cells[i][2] > cells[j][2] })
	type cell struct {
		Lat      float64 `json:"lat"`
		Lon      float64 `json:"lon"`
		Hotspots float64 `json:"hotspots"`
	}
	top := make([]cell, 0, 10)
	for _, c := range cells[:min(10, len(cells))] {
		top = append(top, cell{Lat: c[0], Lon: c[1], Hotspots: round(c[2])})
	}
	out := map[string]any{"area": p.Area.Label(), "from": res.From, "to": res.To, "total_hotspots": round(res.Total),
		"cells_with_fire": len(res.Cells), "top_cells": top, "note": "Cells are 1°x1°; lat/lon is the cell center."}
	card := &Card{Kind: "hotspots", Title: p.Area.Label(), Area: search, From: res.From, To: res.To,
		Data: map[string]any{"total": round(res.Total), "cells": len(res.Cells), "top": top}}
	return Result{ForModel: out, Card: card}, nil
}

// ---- find_region -----------------------------------------------------------

type findRegionTool struct{ svc Regions }

func (t findRegionTool) Spec() ToolSpec {
	return ToolSpec{
		Name: "find_region",
		Description: "Find countries by name (English, partial match is fine) and get their id, bounding box of fire, center and " +
			"harmonization status. Use it to turn a country name into a bbox area for the other tools.",
		Parameters: schema(`"query": {"type": "string", "description": "Country name or part of it"}`, "query"),
	}
}

func fold(s string) string { return strings.ToLower(strings.TrimSpace(s)) }

func (t findRegionTool) Call(ctx context.Context, raw json.RawMessage) (Result, error) {
	var p struct {
		Query string `json:"query"`
	}
	if err := decode(raw, &p); err != nil {
		return Result{}, err
	}
	if fold(p.Query) == "" {
		return Result{}, bad(errors.New("query is empty"))
	}
	list, err := t.svc.List(ctx)
	if err != nil {
		return Result{}, err
	}
	q := fold(p.Query)
	var out []map[string]any
	for _, r := range list {
		if !strings.Contains(fold(r.Name), q) && fold(r.ID) != q {
			continue
		}
		out = append(out, map[string]any{"id": r.ID, "name": r.Name, "status": r.Status, "quality": r.Quality,
			"scope": r.Scope, "bbox_west_south_east_north": r.BBox, "center_lat_lon": r.Centroid})
		if len(out) == 8 {
			break
		}
	}
	if len(out) == 0 {
		return Result{ForModel: map[string]any{"matches": []any{}, "hint": "No country matched. Use a bbox from your own knowledge."}}, nil
	}
	return Result{ForModel: map[string]any{"matches": out}}, nil
}

// ---- get_region ------------------------------------------------------------

type regionTool struct{ svc Regions }

func (t regionTool) Spec() ToolSpec {
	return ToolSpec{
		Name: "get_region",
		Description: "How well a country's record is harmonized: the model used to turn MODIS into VIIRS-equivalent counts, " +
			"whether it is the country's own or a regional pooled model, quality, warnings and the out-of-sample exam (bias %, R²).",
		Parameters: schema(`"id": {"type": "string", "description": "Region id from find_region"}`, "id"),
	}
}

func (t regionTool) Call(ctx context.Context, raw json.RawMessage) (Result, error) {
	var p struct {
		ID string `json:"id"`
	}
	if err := decode(raw, &p); err != nil {
		return Result{}, err
	}
	d, err := t.svc.Get(ctx, p.ID)
	if errors.Is(err, regions.ErrNotFound) {
		return Result{}, bad(fmt.Errorf("no region with id %q; call find_region first", p.ID))
	}
	if err != nil {
		return Result{}, err
	}
	out := map[string]any{"id": d.ID, "name": d.Name, "status": d.Status, "reason": d.Reason, "scope": d.Scope,
		"pooled_with": d.PooledWith, "model": d.ModelName, "quality": d.Quality, "warnings": d.Warnings,
		"exam_bias_pct": d.ExamBiasPct, "exam_r2": d.ExamR2, "train_hotspots": d.TrainHotspots,
		"exam_hotspots": d.ExamHotspots, "noaa20_over_snpp": d.Handover, "periods": d.Periods}
	card := &Card{Kind: "region", Title: d.Name, Data: out}
	return Result{ForModel: out, Card: card}, nil
}

// ---- get_coverage ----------------------------------------------------------

type coverageTool struct{ svc Regions }

func (t coverageTool) Spec() ToolSpec {
	return ToolSpec{
		Name:        "get_coverage",
		Description: "What the data covers: first month, end of the archive, last day of near real time data, how many countries are harmonized, and the state of the ingest.",
		Parameters:  schema(""),
	}
}

func (t coverageTool) Call(ctx context.Context, _ json.RawMessage) (Result, error) {
	c, err := t.svc.Coverage(ctx)
	if err != nil {
		return Result{}, err
	}
	out := map[string]any{"data_start": c.DataStart, "archive_end": c.ArchiveEnd, "recent_first_day": c.RecentFirstDay,
		"recent_last_day": c.RecentLastDay, "regions": c.Regions, "ingest": c.Ingest, "cell_degrees": c.CellDegrees}
	return Result{ForModel: out, Card: &Card{Kind: "coverage", Title: "Data coverage", Data: out}}, nil
}

// NewTools builds the tools over the app's services.
func NewTools(cal Calendars, maps Maps, regs Regions, now func() time.Time) []Tool {
	if now == nil {
		now = time.Now
	}
	return []Tool{
		calendarTool{svc: cal, now: now},
		anomaliesTool{svc: maps},
		fireMapTool{svc: maps, now: now},
		sensorsTool{svc: cal, now: now},
		findRegionTool{svc: regs},
		regionTool{svc: regs},
		coverageTool{svc: regs},
	}
}
