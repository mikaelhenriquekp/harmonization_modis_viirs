package harmonize

import (
	"math"
	"testing"
)

func TestEvaluateMatchesProofOfConcept(t *testing.T) {
	for name, c := range examCases(t) {
		exam := toRows(t, c.Exam)
		check := func(t *testing.T, rows []Row, pred []float64, want map[string]*float64) {
			t.Helper()
			got := Evaluate(rows, pred)
			fields := map[string]float64{
				"sesgo_%": got.BiasPct, "error_zona_mes": got.ZoneError, "spearman_celda": got.Spearman,
				"R2_total_mensual": got.R2Monthly, "error_total_mensual": got.MonthlyError,
			}
			for k, g := range fields {
				w := want[k]
				if w == nil {
					if !math.IsNaN(g) {
						t.Errorf("%s = %v, want NaN", k, g)
					}
					continue
				}
				if math.Abs(g-*w) > 1e-9 {
					t.Errorf("%s = %v, want %v", k, g, *w)
				}
			}
		}
		for py, m := range c.Models {
			t.Run(name+"/"+py[:1], func(t *testing.T) { check(t, exam, m.Pred, m.Metrics) })
		}
		for py, m := range c.EnergyModels {
			t.Run(name+"/energy/"+py[:1], func(t *testing.T) { check(t, AsEnergy(exam), m.Pred, m.Metrics) })
		}
		t.Run(name+"/unharmonized", func(t *testing.T) {
			pred := make([]float64, len(exam))
			for i, r := range exam {
				pred[i] = r.M
			}
			check(t, exam, pred, c.Unharmonized)
		})
	}
}

func TestExamAndChooseMatchProofOfConcept(t *testing.T) {
	for name, c := range examCases(t) {
		t.Run(name, func(t *testing.T) {
			train, exam := toRows(t, c.Train), toRows(t, c.Exam)
			got, err := Choose(RunExam(CountModels, train, exam), MaxBiasPct)
			if err != nil {
				t.Fatal(err)
			}
			if got != modelID(c.Chosen) {
				t.Errorf("chosen = %s, want %s", got, c.Chosen)
			}
			gotE, err := Choose(RunExam(EnergyModels, AsEnergy(train), AsEnergy(exam)), MaxBiasPct)
			if err != nil {
				t.Fatal(err)
			}
			if gotE != modelID(c.ChosenEnergy) {
				t.Errorf("chosen energy = %s, want %s", gotE, c.ChosenEnergy)
			}
		})
	}
}

func TestChooseRespectsBiasLimit(t *testing.T) {
	entry := func(id ModelID, bias, zone float64) ExamEntry {
		return ExamEntry{Model: id, Metrics: Metrics{BiasPct: bias, ZoneError: zone}}
	}
	tests := []struct {
		name    string
		entries []ExamEntry
		want    ModelID
	}{
		{"lowest error within bias", []ExamEntry{
			entry("A", 25, 1.0), entry("B", 3, 2.0), entry("C", -4, 1.5), entry("D", 30, 0.5),
			entry("E", 50, 0.4), entry("F", 40, 0.3), entry("G", 60, 0.2),
		}, "C"},
		{"none within bias: smallest bias", []ExamEntry{entry("A", 25, 1), entry("B", -12, 2), entry("C", 40, 0.1)}, "B"},
		{"NaN error goes last", []ExamEntry{entry("A", 1, math.NaN()), entry("B", 2, 5)}, "B"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := Choose(tt.entries, MaxBiasPct)
			if err != nil || got != tt.want {
				t.Errorf("Choose = %s, %v; want %s", got, err, tt.want)
			}
		})
	}
	if _, err := Choose([]ExamEntry{entry("A", 1, math.NaN())}, MaxBiasPct); err == nil {
		t.Error("Choose with only NaN errors should fail")
	}
}

func TestEvaluatePerfectPrediction(t *testing.T) {
	exam := toRows(t, examCases(t)["synthetic"].Exam)
	pred := make([]float64, len(exam))
	for i, r := range exam {
		pred[i] = r.V
	}
	m := Evaluate(exam, pred)
	if m.BiasPct != 0 || m.ZoneError != 0 || m.R2Monthly != 1 {
		t.Errorf("perfect = %+v", m)
	}
}

func TestJump(t *testing.T) {
	annual := map[int]float64{2009: 100, 2010: 100, 2011: 100, 2012: 400, 2013: 400, 2014: 400}
	if got := Jump(annual); got != 4 {
		t.Errorf("Jump = %v, want 4", got)
	}
	if got := Jump(map[int]float64{2009: 1}); !math.IsNaN(got) {
		t.Errorf("Jump without after years = %v, want NaN", got)
	}
}

func TestRound(t *testing.T) {
	tests := []struct {
		x    float64
		n    int
		want float64
	}{{2.675, 2, 2.67}, {0.125, 2, 0.12}, {-9.95, 1, -9.9}, {1.05, 1, 1.1}, {7.0, 1, 7}}
	for _, tt := range tests {
		if got := round(tt.x, tt.n); got != tt.want {
			t.Errorf("round(%v, %d) = %v, want %v", tt.x, tt.n, got, tt.want)
		}
	}
}
