package harmonize

import (
	"math"
	"testing"
)

func TestModelsMatchProofOfConcept(t *testing.T) {
	for name, c := range examCases(t) {
		train, exam := toRows(t, c.Train), toRows(t, c.Exam)
		for py, want := range c.Models {
			id := modelID(py)
			t.Run(name+"/"+string(id), func(t *testing.T) {
				// The count models are fitted iteratively; the PoC stops at a
				// looser tolerance than we do, so allow a small difference.
				rel := 1e-9
				if id == ModelCount || id == ModelCountDayNight {
					rel = 1e-5
				}
				comparePred(t, CountModels[id].Fit(train).Predict(exam), want.Pred, rel)
			})
		}
		for py, want := range c.EnergyModels {
			id := modelID(py)
			t.Run(name+"/energy/"+string(id), func(t *testing.T) {
				comparePred(t, EnergyModels[id].Fit(AsEnergy(train)).Predict(AsEnergy(exam)), want.Pred, 1e-9)
			})
		}
	}
}

func comparePred(t *testing.T, got, want []float64, rel float64) {
	t.Helper()
	if len(got) != len(want) {
		t.Fatalf("len = %d, want %d", len(got), len(want))
	}
	for i := range got {
		if !near(got[i], want[i], rel, 1e-6) {
			t.Fatalf("pred[%d] = %v, want %v", i, got[i], want[i])
		}
	}
}

func TestRatioExact(t *testing.T) {
	rows := []Row{{Month: MustMonth("2012-02"), M: 10, V: 40}, {Month: MustMonth("2012-03"), M: 5, V: 20}}
	got := CountModels[ModelRatio].Fit(rows).Predict(rows)
	if got[0] != 40 || got[1] != 20 {
		t.Errorf("ratio = %v", got)
	}
}

func TestMonthlyRatioDistinguishesMonths(t *testing.T) {
	train := []Row{
		{Month: MustMonth("2012-02"), M: 10, V: 20}, {Month: MustMonth("2012-08"), M: 10, V: 60},
		{Month: MustMonth("2013-02"), M: 20, V: 40}, {Month: MustMonth("2013-08"), M: 20, V: 120},
	}
	got := CountModels[ModelMonthlyRatio].Fit(train).Predict([]Row{{Month: MustMonth("2019-02"), M: 5}, {Month: MustMonth("2019-08"), M: 5}})
	if got[0] != 10 || got[1] != 30 {
		t.Errorf("monthly ratio = %v", got)
	}
}

func TestQuantilesMonotoneAndExtrapolate(t *testing.T) {
	var train []Row
	for i, m := range MonthRange(MustMonth("2012-02"), MustMonth("2012-11")) {
		train = append(train, Row{Month: m, M: float64(10 * (i + 1)), V: float64(40 * (i + 1))})
	}
	got := CountModels[ModelQuantiles].Fit(train).Predict([]Row{
		{Month: MustMonth("2005-01"), M: 5}, {Month: MustMonth("2005-02"), M: 55}, {Month: MustMonth("2005-03"), M: 500},
	})
	want := []float64{20, 220, 2000}
	for i := range want {
		if math.Abs(got[i]-want[i]) > 1e-9 {
			t.Errorf("quantiles = %v, want %v", got, want)
		}
	}
}

func TestCountModelGivesFireWhereModisSawNothing(t *testing.T) {
	c := examCases(t)["synthetic"]
	train, exam := toRows(t, c.Train), toRows(t, c.Exam)
	count := CountModels[ModelCount].Fit(train).Predict(exam)
	ratio := CountModels[ModelRatio].Fit(train).Predict(exam)
	var zeros, sumCount, sumRatio float64
	for i, r := range exam {
		if r.M == 0 {
			zeros++
			sumCount += count[i]
			sumRatio += ratio[i]
		}
	}
	if zeros == 0 || sumCount <= 0 || sumRatio != 0 {
		t.Errorf("zeros=%v count=%v ratio=%v", zeros, sumCount, sumRatio)
	}
}

func TestModelsDoNotLearnFromTheExam(t *testing.T) {
	c := examCases(t)["synthetic"]
	train, exam := toRows(t, c.Train), toRows(t, c.Exam)
	changed := make([]Row, len(exam))
	for i, r := range exam {
		r.V *= 100
		r.VDay *= 100
		r.VNight *= 100
		changed[i] = r
	}
	for id, m := range CountModels {
		p := m.Fit(train)
		a, b := p.Predict(exam), p.Predict(changed)
		for i := range a {
			if a[i] != b[i] {
				t.Fatalf("%s uses the exam's VIIRS counts", id)
			}
		}
	}
}

func TestDayNightWithoutEnoughNightFallsBack(t *testing.T) {
	var train []Row
	for i, m := range MonthRange(MustMonth("2012-02"), MustMonth("2013-12")) {
		v := float64(4 * (i + 1))
		train = append(train, Row{Month: m, M: float64(i + 1), V: v, MDay: float64(i + 1), VDay: v})
	}
	got := CountModels[ModelRatioDayNight].Fit(train).Predict(train)
	want := CountModels[ModelRatio].Fit(train).Predict(train)
	for i := range got {
		if math.IsNaN(got[i]) || got[i] != want[i] {
			t.Fatalf("day/night without night = %v, want %v", got[i], want[i])
		}
	}
}
