// Package calendar is the burning activity calendar: monthly harmonized
// hotspots of an area of interest, with the historical median of every month,
// anomalies, years ranked and how the current month compares.
package calendar

import (
	"math"
	"sort"
	"time"

	"github.com/nasa-challenge/app/backend/internal/harmonize"
)

// FirstMonth is the first month of the harmonized record (first full month of Aqua).
var FirstMonth = harmonize.MustMonth("2002-07")

// Statuses of the current month against its history.
const (
	StatusMuchAbove = "much_above" // above the 90th percentile of past years
	StatusAbove     = "above"      // above the 75th
	StatusNormal    = "normal"
	StatusBelow     = "below"      // below the 25th
	StatusMuchBelow = "much_below" // below the 10th
	StatusNoHistory = "no_history"
)

// Accessible sequential palette (ColorBrewer YlOrRd, colorblind safe) and the
// color of months without hotspots.
var (
	palette   = []string{"#ffffb2", "#fed976", "#feb24c", "#fd8d3c", "#fc4e2a", "#e31a1c", "#b10026"}
	zeroColor = "#f2f2f2"
)

// MonthTotal is the harmonized total of an area for one month.
type MonthTotal struct {
	Month       harmonize.Month
	Hotspots    float64
	FRP         float64
	Source      string
	Provisional bool
}

// Query is the period asked for, the current time and the last day the data
// covers (zero means up to now).
type Query struct {
	From, To  harmonize.Month
	Now       time.Time
	DataUntil time.Time
}

// MonthStat is one month of the calendar.
type MonthStat struct {
	Month       string   `json:"month"`
	Year        int      `json:"year"`
	MonthOfYear int      `json:"month_of_year"`
	Hotspots    float64  `json:"hotspots"`
	FRP         float64  `json:"frp_mw"`
	Source      string   `json:"source"`
	Estimated   bool     `json:"estimated"`   // rebuilt from MODIS (before 2012-02)
	Provisional bool     `json:"provisional"` // near real time data
	Incomplete  bool     `json:"incomplete"`  // the month is not over
	Median      *float64 `json:"median_same_month"`
	AnomalyPct  *float64 `json:"anomaly_pct"`
	Percentile  *float64 `json:"percentile"`
	Class       int      `json:"class"`
	raw         float64
}

// Climatology summarizes one month of the year over the complete months.
type Climatology struct {
	MonthOfYear int      `json:"month_of_year"`
	Years       int      `json:"years"`
	Median      *float64 `json:"median"`
	Mean        *float64 `json:"mean"`
	P25         *float64 `json:"p25"`
	P75         *float64 `json:"p75"`
	Min         *float64 `json:"min"`
	Max         *float64 `json:"max"`
}

// YearStat is the total of a year.
type YearStat struct {
	Year     int     `json:"year"`
	Hotspots float64 `json:"hotspots"`
	FRP      float64 `json:"frp_mw"`
	Months   int     `json:"months"`
	Complete bool    `json:"complete"`
	Rank     *int    `json:"rank"` // among complete years, 1 = most hotspots
}

// Current compares the last month of the range with the same month of past years.
type Current struct {
	Month           string   `json:"month"`
	Hotspots        float64  `json:"hotspots"`
	Incomplete      bool     `json:"incomplete"`
	ElapsedFraction float64  `json:"elapsed_fraction"`
	Projected       float64  `json:"projected"` // at the current pace, for the whole month
	Median          *float64 `json:"median"`
	ExpectedByNow   *float64 `json:"expected_by_now"`
	AnomalyPct      *float64 `json:"anomaly_pct"`
	Percentile      *float64 `json:"percentile"`
	Rank            int      `json:"rank"` // among the same month of every year compared, 1 = most
	YearsCompared   int      `json:"years_compared"`
	Status          string   `json:"status"`
}

// Peak points at the busiest parts of the record.
type Peak struct {
	MonthOfYear   int     `json:"month_of_year"` // highest median
	RecordMonth   string  `json:"record_month"`
	RecordValue   float64 `json:"record_hotspots"`
	BusiestYear   int     `json:"busiest_year"`
	BusiestTotal  float64 `json:"busiest_year_hotspots"`
	QuietestYear  int     `json:"quietest_year"`
	QuietestTotal float64 `json:"quietest_year_hotspots"`
}

// Grid is the calendar as a year x month matrix (null outside the range).
type Grid struct {
	Years   []int        `json:"years"`
	Values  [][]*float64 `json:"values"`
	Classes [][]int      `json:"classes"` // -1 outside the range, 0 no hotspots, 1.. color class
}

// Scale is the color scale of the classes: Colors[0] is for zero, Colors[i]
// for values up to Breaks[i-1], the last color for values above every break.
type Scale struct {
	Palette string    `json:"palette"`
	Breaks  []float64 `json:"breaks"`
	Colors  []string  `json:"colors"`
}

// Calendar is everything the burning calendar shows.
type Calendar struct {
	From        string        `json:"from"`
	To          string        `json:"to"`
	DataUntil   string        `json:"data_until"`
	Months      []MonthStat   `json:"months"`
	Grid        Grid          `json:"grid"`
	Climatology []Climatology `json:"climatology"`
	Years       []YearStat    `json:"years"`
	Current     *Current      `json:"current"`
	Peak        Peak          `json:"peak"`
	Scale       Scale         `json:"scale"`
}

func round1(v float64) float64 { return math.Round(v*10) / 10 }

func ptr(v float64) *float64 {
	if math.IsNaN(v) || math.IsInf(v, 0) {
		return nil
	}
	r := math.Round(v*100) / 100
	return &r
}

// Build computes the calendar from the monthly totals of an area.
func Build(totals []MonthTotal, q Query) Calendar {
	until := q.Now
	if !q.DataUntil.IsZero() && q.DataUntil.Before(until) {
		until = q.DataUntil
	}
	nowMonth := harmonize.NewMonth(until.Year(), int(until.Month()))
	open := until.Day() < daysIn(until) // the last month with data is not over
	from, to := max(q.From, FirstMonth), min(q.To, nowMonth)
	if to < from {
		to = from
	}
	byMonth := map[harmonize.Month]MonthTotal{}
	for _, t := range totals {
		byMonth[t.Month] = t
	}

	months := make([]MonthStat, 0, int(to-from)+1)
	for _, m := range harmonize.MonthRange(from, to) {
		t := byMonth[m]
		src := t.Source
		if src == "" {
			src = defaultSource(m)
		}
		months = append(months, MonthStat{
			Month: m.String(), Year: m.Year(), MonthOfYear: m.Calendar(),
			Hotspots: round1(t.Hotspots), FRP: round1(t.FRP), Source: src, raw: t.Hotspots,
			Estimated: m <= harmonize.ReconstructTo, Provisional: t.Provisional, Incomplete: open && m == nowMonth,
		})
	}

	// climatology from complete months
	same := [13][]float64{}
	for _, s := range months {
		if !s.Incomplete {
			same[s.MonthOfYear] = append(same[s.MonthOfYear], s.Hotspots)
		}
	}
	clim := make([]Climatology, 12)
	medians := [13]float64{}
	for c := 1; c <= 12; c++ {
		v := same[c]
		clim[c-1] = Climatology{MonthOfYear: c, Years: len(v)}
		medians[c] = math.NaN()
		if len(v) == 0 {
			continue
		}
		s := sorted(v)
		medians[c] = median(s)
		clim[c-1].Median, clim[c-1].Mean = ptr(medians[c]), ptr(mean(s))
		clim[c-1].P25, clim[c-1].P75 = ptr(quantile(s, 0.25)), ptr(quantile(s, 0.75))
		clim[c-1].Min, clim[c-1].Max = ptr(s[0]), ptr(s[len(s)-1])
	}

	scale := buildScale(months)
	for i := range months {
		s := &months[i]
		s.Class = classOf(s.Hotspots, scale.Breaks)
		if md := medians[s.MonthOfYear]; !math.IsNaN(md) && !s.Incomplete {
			s.Median = ptr(md)
			if md > 0 {
				s.AnomalyPct = ptr((s.Hotspots - md) / md * 100)
			}
			s.Percentile = ptr(percentile(same[s.MonthOfYear], s.Hotspots))
		}
	}

	c := Calendar{From: from.String(), To: to.String(), DataUntil: until.Format(time.DateOnly), Months: months, Climatology: clim, Scale: scale}
	c.Grid = buildGrid(months)
	c.Years = buildYears(months)
	c.Current = buildCurrent(months, until)
	c.Peak = buildPeak(months, medians, c.Years)
	return c
}

func defaultSource(m harmonize.Month) string {
	if m <= harmonize.ReconstructTo {
		return string(harmonize.SourceAquaHarmonized)
	}
	return string(harmonize.SourceSNPP)
}

func buildScale(months []MonthStat) Scale {
	var pos []float64
	for _, m := range months {
		if m.Hotspots > 0 && !m.Incomplete {
			pos = append(pos, m.Hotspots)
		}
	}
	s := Scale{Palette: "YlOrRd", Breaks: []float64{}}
	if len(pos) > 0 {
		v := sorted(pos)
		for i := 1; i < len(palette); i++ {
			b := round1(quantile(v, float64(i)/float64(len(palette))))
			if n := len(s.Breaks); b > 0 && (n == 0 || b > s.Breaks[n-1]) && b < v[len(v)-1] {
				s.Breaks = append(s.Breaks, b)
			}
		}
	}
	// spread the palette over the classes there are
	classes := len(s.Breaks) + 1
	s.Colors = []string{zeroColor}
	for i := 0; i < classes; i++ {
		j := 0
		if classes > 1 {
			j = int(math.Round(float64(i) * float64(len(palette)-1) / float64(classes-1)))
		}
		s.Colors = append(s.Colors, palette[j])
	}
	return s
}

func classOf(v float64, breaks []float64) int {
	if v <= 0 {
		return 0
	}
	c := 1
	for _, b := range breaks {
		if v > b {
			c++
		}
	}
	return c
}

func buildGrid(months []MonthStat) Grid {
	g := Grid{}
	if len(months) == 0 {
		return g
	}
	y0, y1 := months[0].Year, months[len(months)-1].Year
	idx := map[int]int{}
	for y := y0; y <= y1; y++ {
		idx[y] = len(g.Years)
		g.Years = append(g.Years, y)
		g.Values = append(g.Values, make([]*float64, 12))
		row := make([]int, 12)
		for i := range row {
			row[i] = -1
		}
		g.Classes = append(g.Classes, row)
	}
	for _, m := range months {
		v := m.Hotspots
		g.Values[idx[m.Year]][m.MonthOfYear-1] = &v
		g.Classes[idx[m.Year]][m.MonthOfYear-1] = m.Class
	}
	return g
}

func buildYears(months []MonthStat) []YearStat {
	var out []YearStat
	idx := map[int]int{}
	for _, m := range months {
		i, ok := idx[m.Year]
		if !ok {
			i = len(out)
			idx[m.Year] = i
			out = append(out, YearStat{Year: m.Year})
		}
		y := &out[i]
		y.Hotspots = round1(y.Hotspots + m.Hotspots)
		y.FRP = round1(y.FRP + m.FRP)
		y.Months++
		if m.Incomplete {
			y.Months = -100 // never complete
		}
	}
	var complete []*YearStat
	for i := range out {
		out[i].Complete = out[i].Months == 12
		if out[i].Months < 0 {
			out[i].Months = 0
			for _, m := range months {
				if m.Year == out[i].Year {
					out[i].Months++
				}
			}
		}
		if out[i].Complete {
			complete = append(complete, &out[i])
		}
	}
	for _, y := range complete {
		r := 1
		for _, o := range complete {
			if o.Hotspots > y.Hotspots {
				r++
			}
		}
		y.Rank = &r
	}
	return out
}

func buildCurrent(months []MonthStat, now time.Time) *Current {
	if len(months) == 0 {
		return nil
	}
	last := months[len(months)-1]
	c := &Current{Month: last.Month, Hotspots: last.Hotspots, Incomplete: last.Incomplete, ElapsedFraction: 1, Status: StatusNoHistory}
	elapsed := 1.0
	if last.Incomplete {
		elapsed = float64(now.Day()) / float64(daysIn(now))
		c.ElapsedFraction = math.Round(elapsed*1000) / 1000
	}
	value := last.raw / elapsed
	c.Projected = round1(value)
	var past []float64
	for _, m := range months[:len(months)-1] {
		if m.MonthOfYear == last.MonthOfYear && !m.Incomplete {
			past = append(past, m.raw)
		}
	}
	c.YearsCompared = len(past)
	c.Rank = 1
	for _, v := range past {
		if v > value && !equal(v, value) {
			c.Rank++
		}
	}
	if len(past) == 0 {
		return c
	}
	md := median(sorted(past))
	c.Median = ptr(md)
	c.ExpectedByNow = ptr(md * elapsed)
	if md > 0 {
		c.AnomalyPct = ptr((value - md) / md * 100)
	}
	p := percentile(past, value)
	c.Percentile = ptr(p)
	switch {
	case p >= 0.9:
		c.Status = StatusMuchAbove
	case p >= 0.75:
		c.Status = StatusAbove
	case p <= 0.1:
		c.Status = StatusMuchBelow
	case p <= 0.25:
		c.Status = StatusBelow
	default:
		c.Status = StatusNormal
	}
	return c
}

func buildPeak(months []MonthStat, medians [13]float64, years []YearStat) Peak {
	var p Peak
	best := math.Inf(-1)
	for c := 1; c <= 12; c++ {
		if !math.IsNaN(medians[c]) && medians[c] > best {
			best, p.MonthOfYear = medians[c], c
		}
	}
	for _, m := range months {
		if m.Hotspots > p.RecordValue {
			p.RecordValue, p.RecordMonth = m.Hotspots, m.Month
		}
	}
	first := true
	for _, y := range years {
		if !y.Complete {
			continue
		}
		if first || y.Hotspots > p.BusiestTotal {
			p.BusiestYear, p.BusiestTotal = y.Year, y.Hotspots
		}
		if first || y.Hotspots < p.QuietestTotal {
			p.QuietestYear, p.QuietestTotal = y.Year, y.Hotspots
		}
		first = false
	}
	return p
}

func daysIn(t time.Time) int { return time.Date(t.Year(), t.Month()+1, 0, 0, 0, 0, 0, time.UTC).Day() }

func sorted(v []float64) []float64 {
	s := append([]float64(nil), v...)
	sort.Float64s(s)
	return s
}

func mean(v []float64) float64 {
	var s float64
	for _, x := range v {
		s += x
	}
	return s / float64(len(v))
}

// median of a slice.
func median(v []float64) float64 {
	s := sorted(v)
	n := len(s)
	if n%2 == 1 {
		return s[n/2]
	}
	return (s[n/2-1] + s[n/2]) / 2
}

// quantile of a sorted slice, linear interpolation (numpy default).
func quantile(s []float64, p float64) float64 {
	pos := p * float64(len(s)-1)
	lo := int(math.Floor(pos))
	hi := min(lo+1, len(s)-1)
	return s[lo] + (s[hi]-s[lo])*(pos-float64(lo))
}

func equal(a, b float64) bool { return math.Abs(a-b) <= 1e-9*math.Max(1, math.Abs(a)) }

// percentile is the mid rank of v among past values: the share below plus half
// the share equal.
func percentile(past []float64, v float64) float64 {
	var below, eq float64
	for _, x := range past {
		switch {
		case equal(x, v):
			eq++
		case x < v:
			below++
		}
	}
	return (below + eq/2) / float64(len(past))
}
