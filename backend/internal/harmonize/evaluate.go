package harmonize

import (
	"encoding/json"
	"errors"
	"math"
	"sort"
	"strconv"
)

// MaxBiasPct is the largest exam bias a model may have to be chosen on error.
const MaxBiasPct = 10

// ModelRaw labels the "MODIS as is" baseline row of an exam.
const ModelRaw ModelID = "raw"

// Metrics compares a prediction with what VIIRS really saw. NaN means the
// metric is undefined (for example a constant series).
type Metrics struct {
	BiasPct      float64 // total bias, %
	ZoneError    float64 // mean absolute error per ~100 km zone and month
	Spearman     float64 // rank correlation per cell and month
	R2Monthly    float64 // R² of the monthly totals
	MonthlyError float64 // mean absolute error of the monthly totals
}

// MarshalJSON writes NaN as null.
func (m Metrics) MarshalJSON() ([]byte, error) {
	n := func(v float64) *float64 {
		if math.IsNaN(v) || math.IsInf(v, 0) {
			return nil
		}
		return &v
	}
	return json.Marshal(struct {
		BiasPct      *float64 `json:"bias_pct"`
		ZoneError    *float64 `json:"zone_month_error"`
		Spearman     *float64 `json:"spearman_cell"`
		R2Monthly    *float64 `json:"r2_monthly_total"`
		MonthlyError *float64 `json:"monthly_total_error"`
	}{n(m.BiasPct), n(m.ZoneError), n(m.Spearman), n(m.R2Monthly), n(m.MonthlyError)})
}

// round rounds like Python's round(): correctly rounded decimal, ties to even.
func round(x float64, n int) float64 {
	if math.IsNaN(x) || math.IsInf(x, 0) {
		return x
	}
	v, _ := strconv.ParseFloat(strconv.FormatFloat(x, 'f', n, 64), 64)
	if v == 0 {
		return 0 // no negative zero
	}
	return v
}

// Evaluate compares pred with the VIIRS column of rows.
func Evaluate(rows []Row, pred []float64) Metrics {
	var so, sp float64
	obs := make([]float64, len(rows))
	type monthTot struct{ o, p float64 }
	months := map[Month]*monthTot{}
	var order []Month
	for i, r := range rows {
		obs[i] = r.V
		so += r.V
		sp += pred[i]
		t, ok := months[r.Month]
		if !ok {
			t = &monthTot{}
			months[r.Month] = t
			order = append(order, r.Month)
		}
		t.o += r.V
		t.p += pred[i]
	}
	m := Metrics{
		BiasPct:   round((sp-so)/math.Max(so, 1)*100, 1),
		ZoneError: round(zoneError(rows, obs, pred), 2),
		Spearman:  math.NaN(),
		R2Monthly: math.NaN(),
	}
	if std(obs) > 0 && std(pred) > 0 {
		m.Spearman = round(pearson(ranks(obs), ranks(pred)), 3)
	}
	var mean float64
	for _, k := range order {
		mean += months[k].o
	}
	mean /= float64(len(order))
	var ss, res, abs float64
	for _, k := range order {
		t := months[k]
		ss += (t.o - mean) * (t.o - mean)
		res += (t.o - t.p) * (t.o - t.p)
		abs += math.Abs(t.o - t.p)
	}
	if ss > 0 {
		m.R2Monthly = round(1-res/ss, 3)
	}
	m.MonthlyError = round(abs/float64(len(order)), 1)
	return m
}

// zoneError is the mean absolute error per 1° block and month: the scale the
// web is used at.
func zoneError(rows []Row, obs, pred []float64) float64 {
	type zone struct {
		a, b  float64
		month Month
	}
	type tot struct{ o, p float64 }
	z := map[zone]*tot{}
	for i, r := range rows {
		lat, lon := r.Cell.Center()
		k := zone{math.Floor(lat), math.Floor(lon), r.Month}
		t, ok := z[k]
		if !ok {
			t = &tot{}
			z[k] = t
		}
		t.o += obs[i]
		t.p += pred[i]
	}
	var s float64
	for _, t := range z {
		s += math.Abs(t.o - t.p)
	}
	return s / float64(len(z))
}

func std(x []float64) float64 {
	var m float64
	for _, v := range x {
		m += v
	}
	m /= float64(len(x))
	var s float64
	for _, v := range x {
		s += (v - m) * (v - m)
	}
	return math.Sqrt(s / float64(len(x)))
}

// ranks returns average ranks (ties share the mean of their positions).
func ranks(x []float64) []float64 {
	idx := make([]int, len(x))
	for i := range idx {
		idx[i] = i
	}
	sort.SliceStable(idx, func(a, b int) bool { return x[idx[a]] < x[idx[b]] })
	r := make([]float64, len(x))
	for i := 0; i < len(idx); {
		j := i
		for j+1 < len(idx) && x[idx[j+1]] == x[idx[i]] {
			j++
		}
		avg := float64(i+j)/2 + 1
		for k := i; k <= j; k++ {
			r[idx[k]] = avg
		}
		i = j + 1
	}
	return r
}

func pearson(a, b []float64) float64 {
	var ma, mb float64
	for i := range a {
		ma += a[i]
		mb += b[i]
	}
	n := float64(len(a))
	ma, mb = ma/n, mb/n
	var sab, saa, sbb float64
	for i := range a {
		sab += (a[i] - ma) * (b[i] - mb)
		saa += (a[i] - ma) * (a[i] - ma)
		sbb += (b[i] - mb) * (b[i] - mb)
	}
	return sab / math.Sqrt(saa*sbb)
}

// ExamEntry is one model's grade.
type ExamEntry struct {
	Model ModelID `json:"model"`
	Name  string  `json:"name"`
	Metrics
}

// MarshalJSON flattens the metrics next to the model.
func (e ExamEntry) MarshalJSON() ([]byte, error) {
	b, err := e.Metrics.MarshalJSON()
	if err != nil {
		return nil, err
	}
	var m map[string]any
	if err := json.Unmarshal(b, &m); err != nil {
		return nil, err
	}
	m["model"], m["name"] = e.Model, e.Name
	return json.Marshal(m)
}

// RunExam fits each model on train and grades it on exam.
func RunExam(models map[ModelID]Model, train, exam []Row) []ExamEntry {
	out := make([]ExamEntry, 0, len(models))
	for _, id := range SortedIDs(models) {
		m := models[id]
		out = append(out, ExamEntry{Model: id, Name: m.Name, Metrics: Evaluate(exam, m.Fit(train).Predict(exam))})
	}
	return out
}

// RawEntry grades MODIS as is, the baseline every model must beat.
func RawEntry(exam []Row) ExamEntry {
	pred := make([]float64, len(exam))
	for i, r := range exam {
		pred[i] = r.M
	}
	return ExamEntry{Model: ModelRaw, Name: "unharmonized (MODIS as is)", Metrics: Evaluate(exam, pred)}
}

// ErrNothingToCompare means no model has a defined error.
var ErrNothingToCompare = errors.New("no exam errors to compare")

// Choose picks the lowest zone error among the models with |bias| <= maxBias;
// if none qualifies, the smallest bias. The raw baseline is never chosen.
func Choose(entries []ExamEntry, maxBias float64) (ModelID, error) {
	var cand []ExamEntry
	defined := false
	for _, e := range entries {
		if e.Model == ModelRaw {
			continue
		}
		cand = append(cand, e)
		if !math.IsNaN(e.ZoneError) {
			defined = true
		}
	}
	if !defined {
		return "", ErrNothingToCompare
	}
	var ok []ExamEntry
	for _, e := range cand {
		if math.Abs(e.BiasPct) <= maxBias {
			ok = append(ok, e)
		}
	}
	if len(ok) > 0 {
		sort.SliceStable(ok, func(i, j int) bool { return less(ok[i].ZoneError, ok[j].ZoneError) })
		return ok[0].Model, nil
	}
	sort.SliceStable(cand, func(i, j int) bool { return less(math.Abs(cand[i].BiasPct), math.Abs(cand[j].BiasPct)) })
	return cand[0].Model, nil
}

// less orders NaN last.
func less(a, b float64) bool {
	if math.IsNaN(b) {
		return !math.IsNaN(a)
	}
	return a < b
}

// Jump is the ratio between the mean yearly total just after (2012–2014) and
// just before (2009–2011) the sensor change. 1 means no jump.
func Jump(annual map[int]float64) float64 {
	mean := func(a, b int) float64 {
		var s, n float64
		for y := a; y <= b; y++ {
			if v, ok := annual[y]; ok {
				s += v
				n++
			}
		}
		if n == 0 {
			return math.NaN()
		}
		return s / n
	}
	return mean(2012, 2014) / mean(2009, 2011)
}
