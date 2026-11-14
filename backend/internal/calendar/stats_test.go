package calendar

import (
	"math"
	"testing"
	"time"

	"github.com/nasa-challenge/app/backend/internal/harmonize"
)

// history builds monthly totals from 2002-07 to the given month: every
// August has 100·(1+year%3) hotspots, other months 10.
func history(to string) []MonthTotal {
	var out []MonthTotal
	for _, m := range harmonize.MonthRange(harmonize.MustMonth("2002-07"), harmonize.MustMonth(to)) {
		v := 10.0
		if m.Calendar() == 8 {
			v = float64(100 * (1 + m.Year()%3))
		}
		src := "viirs_snpp"
		if m <= harmonize.MustMonth("2012-01") {
			src = "aqua_harmonized"
		}
		out = append(out, MonthTotal{Month: m, Hotspots: v, FRP: v * 10, Source: src})
	}
	return out
}

func q(from, to string, now string) Query {
	n, _ := time.Parse(time.DateOnly, now)
	return Query{From: harmonize.MustMonth(from), To: harmonize.MustMonth(to), Now: n}
}

func TestBuildFillsEveryMonthAndFlagsSources(t *testing.T) {
	totals := history("2026-10")
	totals = append(totals, MonthTotal{Month: harmonize.MustMonth("2026-11"), Hotspots: 5, Source: "viirs_recent", Provisional: true})
	c := Build(totals, q("2002-07", "2026-11", "2026-11-14"))
	if len(c.Months) != 293 {
		t.Fatalf("months = %d, want 293", len(c.Months))
	}
	first, last := c.Months[0], c.Months[len(c.Months)-1]
	if !first.Estimated || first.Source != "aqua_harmonized" {
		t.Errorf("first = %+v", first)
	}
	if !last.Incomplete || !last.Provisional || last.Estimated {
		t.Errorf("last = %+v", last)
	}
	if got := c.Months[115]; got.Month != "2012-02" || got.Estimated {
		t.Errorf("2012-02 = %+v", got)
	}
}

func TestBuildMissingMonthsAreZero(t *testing.T) {
	c := Build([]MonthTotal{{Month: harmonize.MustMonth("2020-08"), Hotspots: 7}}, q("2020-07", "2020-09", "2026-11-14"))
	if len(c.Months) != 3 || c.Months[0].Hotspots != 0 || c.Months[1].Hotspots != 7 || c.Months[2].Hotspots != 0 {
		t.Errorf("months = %+v", c.Months)
	}
}

func TestClimatologyUsesCompleteMonthsOnly(t *testing.T) {
	totals := history("2026-10")
	totals = append(totals, MonthTotal{Month: harmonize.MustMonth("2026-11"), Hotspots: 9999})
	c := Build(totals, q("2002-07", "2026-11", "2026-11-14"))
	aug := c.Climatology[7]
	if aug.MonthOfYear != 8 || aug.Years != 25 || aug.Median == nil || *aug.Median != 200 || *aug.Min != 100 || *aug.Max != 300 {
		t.Errorf("august = %+v", aug)
	}
	nov := c.Climatology[10]
	if nov.Years != 24 || *nov.Max != 10 {
		t.Errorf("november must not include the incomplete month: %+v", nov)
	}
	if c.Peak.MonthOfYear != 8 {
		t.Errorf("peak = %+v", c.Peak)
	}
}

func TestCurrentMonthAgainstHistoricalMedian(t *testing.T) {
	tests := []struct {
		name       string
		to, now    string
		value      float64
		wantStatus string
		incomplete bool
	}{
		{"complete month far above", "2026-08", "2026-11-14", 1000, StatusMuchAbove, false},
		{"complete month normal", "2026-08", "2026-11-14", 200, StatusNormal, false},
		{"complete month far below", "2026-08", "2026-11-14", 50, StatusMuchBelow, false},
		// half of November gone: 6 hotspots so far projects to ~12.9, above every past November (10)
		{"incomplete month uses the pace", "2026-11", "2026-11-14", 6, StatusMuchAbove, true},
		{"incomplete month on pace", "2026-11", "2026-11-14", 14.0 / 3, StatusNormal, true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			totals := history(harmonize.MustMonth(tt.to).Add(-1).String())
			totals = append(totals, MonthTotal{Month: harmonize.MustMonth(tt.to), Hotspots: tt.value})
			c := Build(totals, q("2002-07", tt.to, tt.now))
			cur := c.Current
			if cur == nil {
				t.Fatal("no current")
			}
			if cur.Status != tt.wantStatus || cur.Incomplete != tt.incomplete {
				t.Errorf("current = %+v", *cur)
			}
			if cur.Median == nil || cur.YearsCompared != 24 {
				t.Errorf("median/years = %v/%d", cur.Median, cur.YearsCompared)
			}
		})
	}
}

func TestCurrentWithoutHistory(t *testing.T) {
	c := Build([]MonthTotal{{Month: harmonize.MustMonth("2026-10"), Hotspots: 3}}, q("2026-10", "2026-10", "2026-11-14"))
	if c.Current == nil || c.Current.Status != StatusNoHistory || c.Current.Median != nil {
		t.Errorf("current = %+v", c.Current)
	}
}

func TestYearsRankedByHotspots(t *testing.T) {
	c := Build(history("2026-10"), q("2002-07", "2026-10", "2026-11-14"))
	byYear := map[int]YearStat{}
	for _, y := range c.Years {
		byYear[y.Year] = y
	}
	if byYear[2002].Complete || byYear[2026].Complete || !byYear[2010].Complete {
		t.Error("only full years are complete")
	}
	// years with year%3 == 2 have August = 300: the busiest complete years
	if byYear[2003].Rank == nil || *byYear[2003].Rank != 1 || byYear[2002].Rank != nil {
		t.Errorf("2003 = %+v, 2002 = %+v", byYear[2003], byYear[2002])
	}
	if byYear[2003].Hotspots != 300+11*10 {
		t.Errorf("2003 total = %v", byYear[2003].Hotspots)
	}
}

func TestGridAndColorClasses(t *testing.T) {
	c := Build(history("2026-10"), q("2002-07", "2026-10", "2026-11-14"))
	if len(c.Grid.Years) != 25 || c.Grid.Years[0] != 2002 || len(c.Grid.Values) != 25 || len(c.Grid.Values[0]) != 12 {
		t.Fatalf("grid = %d years", len(c.Grid.Years))
	}
	if c.Grid.Values[0][0] != nil || c.Grid.Values[0][6] == nil || c.Grid.Values[24][11] != nil {
		t.Error("months outside the range must be null")
	}
	if len(c.Scale.Colors) != len(c.Scale.Breaks)+2 {
		t.Errorf("scale = %+v", c.Scale)
	}
	aug, jan := c.Grid.Classes[10][7], c.Grid.Classes[10][0]
	if aug <= jan || jan < 1 {
		t.Errorf("classes aug=%d jan=%d", aug, jan)
	}
	if zero := classOf(0, c.Scale.Breaks); zero != 0 {
		t.Errorf("zero class = %d", zero)
	}
}

func TestAnomalyOfEachMonth(t *testing.T) {
	c := Build(history("2026-10"), q("2002-07", "2026-10", "2026-11-14"))
	for _, m := range c.Months {
		if m.Month == "2010-08" { // 2010%3 == 0 -> 100, median 200
			if m.AnomalyPct == nil || math.Abs(*m.AnomalyPct+50) > 1e-9 {
				t.Errorf("2010-08 anomaly = %v", m.AnomalyPct)
			}
		}
	}
}

func TestMedian(t *testing.T) {
	if median([]float64{3, 1, 2}) != 2 || median([]float64{4, 1, 2, 3}) != 2.5 {
		t.Error("median is wrong")
	}
	if percentile([]float64{1, 2, 3, 4}, 2.5) != 0.5 || percentile([]float64{1, 1}, 1) != 0.5 {
		t.Error("percentile is wrong")
	}
}

func TestBuildStopsWhereTheDataStops(t *testing.T) {
	totals := history("2026-08")
	query := q("2002-07", "2026-11", "2026-11-14")
	query.DataUntil = time.Date(2026, 8, 10, 0, 0, 0, 0, time.UTC) // the ingest is behind
	c := Build(totals, query)
	if c.To != "2026-08" || c.DataUntil != "2026-08-10" {
		t.Errorf("to = %s, data_until = %s", c.To, c.DataUntil)
	}
	cur := c.Current
	if cur.Month != "2026-08" || !cur.Incomplete || cur.ElapsedFraction != 0.323 {
		t.Errorf("current = %+v", *cur)
	}

	query.DataUntil = time.Date(2026, 8, 31, 0, 0, 0, 0, time.UTC) // a whole month is a complete month
	if cur := Build(totals, query).Current; cur.Incomplete {
		t.Errorf("August with every day fetched is complete: %+v", *cur)
	}
}
