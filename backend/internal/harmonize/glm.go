package harmonize

import (
	"errors"
	"math"
)

// countFeatures is the design row of the count model: intercept, log(M+1) and
// one dummy per month of the year (January is the reference).
const countFeatures = 13

func countDesign(m float64, cal int, x []float64) {
	for i := range x {
		x[i] = 0
	}
	x[0] = 1
	x[1] = math.Log1p(m)
	if cal >= 2 {
		x[cal] = 1
	}
}

// fitCount is the count model: log(E[VIIRS]) = a + b·log(M+1) + month effect,
// fitted per cell and month with a negative binomial GLM. Identical rows are
// grouped with frequency weights, which gives the same fit and keeps huge
// countries in memory.
func fitCount(train []Row) Predictor {
	type group struct {
		m   float64
		cal int
		v   float64
	}
	weights := map[group]float64{}
	var order []group
	for _, r := range train {
		g := group{r.M, r.Month.Calendar(), r.V}
		if _, ok := weights[g]; !ok {
			order = append(order, g)
		}
		weights[g]++
	}
	design := make([][]float64, len(order))
	y := make([]float64, len(order))
	w := make([]float64, len(order))
	for i, g := range order {
		design[i] = make([]float64, countFeatures)
		countDesign(g.m, g.cal, design[i])
		y[i], w[i] = g.v, weights[g]
	}

	beta, mu, err := fitGLM(design, y, w, 0)
	if err != nil {
		return fitRatio(train)
	}
	var num, den float64 // overdispersion, method of moments
	for i := range y {
		num += w[i] * ((y[i]-mu[i])*(y[i]-mu[i]) - mu[i])
		den += w[i] * mu[i] * mu[i]
	}
	alpha := math.Max(num/den, 1e-3)
	if nb, _, err := fitGLM(design, y, w, alpha); err == nil {
		beta = nb
	}

	// recalibrate the total so the model has no bias on the training period
	var sy, se float64
	for i := range y {
		sy += w[i] * y[i]
		se += w[i] * math.Exp(dot(design[i], beta))
	}
	c := sy / se
	return PredictFunc(func(rows []Row) []float64 {
		out := make([]float64, len(rows))
		x := make([]float64, countFeatures)
		for i, r := range rows {
			countDesign(r.M, r.Month.Calendar(), x)
			out[i] = c * math.Exp(dot(x, beta))
		}
		return out
	})
}

func dot(a, b []float64) float64 {
	var s float64
	for i := range a {
		s += a[i] * b[i]
	}
	return s
}

var errNoConvergence = errors.New("glm did not converge")

// fitGLM fits a log-link GLM by iteratively reweighted least squares. With
// alpha == 0 it is Poisson, otherwise negative binomial with variance
// mu + alpha·mu². Columns that are all zero get a zero coefficient, as a
// pseudo-inverse would give them.
func fitGLM(x [][]float64, y, w []float64, alpha float64) (beta, mu []float64, err error) {
	n, p := len(y), countFeatures
	active := make([]bool, p)
	for i := range x {
		for j, v := range x[i] {
			if v != 0 && w[i] > 0 {
				active[j] = true
			}
		}
	}
	var mean float64
	for _, v := range y {
		mean += v
	}
	mean /= float64(n)
	mu = make([]float64, n)
	eta := make([]float64, n)
	for i := range y {
		mu[i] = (y[i] + mean) / 2
		eta[i] = math.Log(mu[i])
	}
	dev := math.Inf(1)
	for iter := 0; iter < 200; iter++ {
		normal := make([][]float64, p)
		for j := range normal {
			normal[j] = make([]float64, p)
		}
		b := make([]float64, p)
		for i := range y {
			wi := w[i] * mu[i] / (1 + alpha*mu[i])
			zi := eta[i] + (y[i]-mu[i])/mu[i]
			for j := 0; j < p; j++ {
				if x[i][j] == 0 {
					continue
				}
				b[j] += wi * x[i][j] * zi
				for k := 0; k < p; k++ {
					normal[j][k] += wi * x[i][j] * x[i][k]
				}
			}
		}
		next, ok := solveActive(normal, b, active)
		if !ok {
			return nil, nil, errNoConvergence
		}
		beta = next
		for i := range y {
			eta[i] = dot(x[i], beta)
			mu[i] = math.Exp(eta[i])
		}
		d := deviance(y, mu, w, alpha)
		if math.IsNaN(d) || math.IsInf(d, 0) {
			return nil, nil, errNoConvergence
		}
		if math.Abs(d-dev) <= 1e-10*(math.Abs(d)+1) {
			for _, v := range beta {
				if math.IsNaN(v) || math.IsInf(v, 0) {
					return nil, nil, errNoConvergence
				}
			}
			return beta, mu, nil
		}
		dev = d
	}
	return nil, nil, errNoConvergence
}

func deviance(y, mu, w []float64, alpha float64) float64 {
	var d float64
	for i := range y {
		var t float64
		if y[i] > 0 {
			t = y[i] * math.Log(y[i]/mu[i])
		}
		if alpha == 0 {
			t -= y[i] - mu[i]
		} else {
			t -= (y[i] + 1/alpha) * math.Log((1+alpha*y[i])/(1+alpha*mu[i]))
		}
		d += 2 * w[i] * t
	}
	return d
}

// solveActive solves A·x = b by Cholesky on the active columns only.
func solveActive(a [][]float64, b []float64, active []bool) ([]float64, bool) {
	var idx []int
	for j, ok := range active {
		if ok {
			idx = append(idx, j)
		}
	}
	k := len(idx)
	L := make([][]float64, k)
	for i := range L {
		L[i] = make([]float64, k)
	}
	for i := 0; i < k; i++ {
		for j := 0; j <= i; j++ {
			s := a[idx[i]][idx[j]]
			for m := 0; m < j; m++ {
				s -= L[i][m] * L[j][m]
			}
			if i == j {
				if s <= 0 {
					return nil, false
				}
				L[i][i] = math.Sqrt(s)
			} else {
				L[i][j] = s / L[j][j]
			}
		}
	}
	z := make([]float64, k)
	for i := 0; i < k; i++ {
		s := b[idx[i]]
		for m := 0; m < i; m++ {
			s -= L[i][m] * z[m]
		}
		z[i] = s / L[i][i]
	}
	x := make([]float64, len(b))
	sol := make([]float64, k)
	for i := k - 1; i >= 0; i-- {
		s := z[i]
		for m := i + 1; m < k; m++ {
			s -= L[m][i] * sol[m]
		}
		sol[i] = s / L[i][i]
	}
	for i, j := range idx {
		x[j] = sol[i]
	}
	return x, true
}
