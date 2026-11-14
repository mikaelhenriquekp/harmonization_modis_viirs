package harmonize

import (
	"math"
	"sort"
)

// ModelID names a harmonization model. The letters follow the proof of
// concept so results can be compared one to one.
type ModelID string

// Available models.
const (
	ModelNone          ModelID = "0" // MODIS as is (energy only)
	ModelRatio         ModelID = "A" // VIIRS = k x MODIS
	ModelMonthlyRatio  ModelID = "B" // one k per month of the year
	ModelLogLog        ModelID = "C" // log-log regression on monthly totals
	ModelQuantiles     ModelID = "D" // quantile mapping on monthly totals
	ModelCount         ModelID = "E" // negative binomial count model per cell
	ModelRatioDayNight ModelID = "F" // A, day and night separately
	ModelCountDayNight ModelID = "G" // E, day and night separately
)

// Predictor estimates what VIIRS would have seen from the MODIS columns of a
// table. It never reads the VIIRS columns.
type Predictor interface {
	Predict(rows []Row) []float64
}

// PredictFunc adapts a function to Predictor.
type PredictFunc func(rows []Row) []float64

// Predict implements Predictor.
func (f PredictFunc) Predict(rows []Row) []float64 { return f(rows) }

// Model is a harmonization method that learns from a table with both sensors.
type Model struct {
	ID   ModelID
	Name string
	Fit  func(train []Row) Predictor
}

// MinNight is the number of MODIS night detections needed to learn a separate
// night relationship.
const MinNight = 50

// CountModels are the candidates for hotspot counts.
var CountModels = map[ModelID]Model{
	ModelRatio:         {ModelRatio, "constant ratio", fitRatio},
	ModelMonthlyRatio:  {ModelMonthlyRatio, "ratio per month of the year", fitMonthlyRatio},
	ModelLogLog:        {ModelLogLog, "log-log regression", fitLogLog},
	ModelQuantiles:     {ModelQuantiles, "quantile mapping", fitQuantiles},
	ModelCount:         {ModelCount, "count model (negative binomial)", fitCount},
	ModelRatioDayNight: {ModelRatioDayNight, "ratio, day and night separately", dayNight(fitRatio)},
	ModelCountDayNight: {ModelCountDayNight, "count model, day and night separately", dayNight(fitCount)},
}

// EnergyModels are the candidates for fire radiative power: the models that
// suit continuous magnitudes plus the option of not correcting.
var EnergyModels = map[ModelID]Model{
	ModelNone:         {ModelNone, "no correction", fitNone},
	ModelRatio:        CountModels[ModelRatio],
	ModelMonthlyRatio: CountModels[ModelMonthlyRatio],
	ModelLogLog:       CountModels[ModelLogLog],
	ModelQuantiles:    CountModels[ModelQuantiles],
}

// SortedIDs returns the model IDs of a set in a stable order.
func SortedIDs(models map[ModelID]Model) []ModelID {
	ids := make([]ModelID, 0, len(models))
	for id := range models {
		ids = append(ids, id)
	}
	sort.Slice(ids, func(i, j int) bool { return ids[i] < ids[j] })
	return ids
}

func sums(rows []Row) (m, v float64) {
	for _, r := range rows {
		m += r.M
		v += r.V
	}
	return m, v
}

func globalRatio(rows []Row) float64 {
	m, v := sums(rows)
	if m == 0 {
		return 1
	}
	return v / m
}

func scaleM(rows []Row, k func(Row) float64) []float64 {
	out := make([]float64, len(rows))
	for i, r := range rows {
		out[i] = k(r) * r.M
	}
	return out
}

func fitNone([]Row) Predictor {
	return PredictFunc(func(rows []Row) []float64 { return scaleM(rows, func(Row) float64 { return 1 }) })
}

func fitRatio(train []Row) Predictor {
	k := globalRatio(train)
	return PredictFunc(func(rows []Row) []float64 { return scaleM(rows, func(Row) float64 { return k }) })
}

func fitMonthlyRatio(train []Row) Predictor {
	k := globalRatio(train)
	var m, v [13]float64
	for _, r := range train {
		m[r.Month.Calendar()] += r.M
		v[r.Month.Calendar()] += r.V
	}
	var km [13]float64
	for c := 1; c <= 12; c++ {
		km[c] = k
		if m[c] != 0 {
			km[c] = v[c] / m[c]
		}
	}
	return PredictFunc(func(rows []Row) []float64 {
		return scaleM(rows, func(r Row) float64 { return km[r.Month.Calendar()] })
	})
}

// monthlyTotals sums M and V per month.
func monthlyTotals(rows []Row) (m, v []float64) {
	idx := map[Month]int{}
	for _, r := range rows {
		i, ok := idx[r.Month]
		if !ok {
			i = len(m)
			idx[r.Month] = i
			m = append(m, 0)
			v = append(v, 0)
		}
		m[i] += r.M
		v[i] += r.V
	}
	return m, v
}

// byMonthlyFactor applies to each cell the factor of its month:
// (estimated VIIRS total) / (MODIS total) of that month.
func byMonthlyFactor(rows []Row, totalToTotal func(float64) float64, k float64) []float64 {
	tot := map[Month]float64{}
	for _, r := range rows {
		tot[r.Month] += r.M
	}
	factor := make(map[Month]float64, len(tot))
	for m, t := range tot {
		if t > 0 {
			factor[m] = totalToTotal(t) / t
		} else {
			factor[m] = k
		}
	}
	return scaleM(rows, func(r Row) float64 { return factor[r.Month] })
}

func fitLogLog(train []Row) Predictor {
	k := globalRatio(train)
	mt, vt := monthlyTotals(train)
	n := float64(len(mt))
	x, y := make([]float64, len(mt)), make([]float64, len(mt))
	var mx, my float64
	for i := range mt {
		x[i], y[i] = math.Log1p(mt[i]), math.Log1p(vt[i])
		mx += x[i]
		my += y[i]
	}
	mx, my = mx/n, my/n
	var sxy, sxx float64
	for i := range x {
		sxy += (x[i] - mx) * (y[i] - my)
		sxx += (x[i] - mx) * (x[i] - mx)
	}
	b := sxy / sxx
	a := my - b*mx
	var smear float64 // corrects the bias of coming back from the logarithm
	for i := range x {
		smear += math.Exp(y[i] - (a + b*x[i]))
	}
	smear /= n
	f := func(m float64) float64 { return math.Max(math.Exp(a+b*math.Log1p(m))*smear-1, 0) }
	return PredictFunc(func(rows []Row) []float64 { return byMonthlyFactor(rows, f, k) })
}

func fitQuantiles(train []Row) Predictor {
	k := globalRatio(train)
	xs, ys := monthlyTotals(train)
	sort.Float64s(xs)
	sort.Float64s(ys)
	last := len(xs) - 1
	f := func(m float64) float64 {
		switch {
		case m > xs[last] && xs[last] > 0:
			return ys[last] * m / xs[last] // beyond what was seen: same ratio
		case m < xs[0] && xs[0] > 0:
			return ys[0] * m / xs[0]
		}
		return interp(m, xs, ys)
	}
	return PredictFunc(func(rows []Row) []float64 { return byMonthlyFactor(rows, f, k) })
}

// interp is linear interpolation with numpy.interp semantics, including how it
// resolves repeated x values (the last one wins).
func interp(x float64, xs, ys []float64) float64 {
	last := len(xs) - 1
	if x >= xs[last] {
		return ys[last]
	}
	if x < xs[0] {
		return ys[0]
	}
	j := sort.Search(len(xs), func(i int) bool { return xs[i] > x }) - 1
	if xs[j] == x {
		return ys[j]
	}
	return ys[j] + (ys[j+1]-ys[j])/(xs[j+1]-xs[j])*(x-xs[j])
}

func dayNight(fit func([]Row) Predictor) func([]Row) Predictor {
	return func(train []Row) Predictor {
		var day, night float64
		for _, r := range train {
			day += r.MDay
			night += r.MNight
		}
		if night < MinNight || day <= 0 {
			return fit(train) // not enough night data: one model for everything
		}
		fd, fn := fit(part(train, true)), fit(part(train, false))
		return PredictFunc(func(rows []Row) []float64 {
			a, b := fd.Predict(part(rows, true)), fn.Predict(part(rows, false))
			for i := range a {
				a[i] += b[i]
			}
			return a
		})
	}
}

// part returns the table restricted to day or night overpasses.
func part(rows []Row, day bool) []Row {
	out := make([]Row, len(rows))
	for i, r := range rows {
		out[i] = Row{Cell: r.Cell, Month: r.Month}
		if day {
			out[i].M, out[i].V = r.MDay, r.VDay
		} else {
			out[i].M, out[i].V = r.MNight, r.VNight
		}
	}
	return out
}
