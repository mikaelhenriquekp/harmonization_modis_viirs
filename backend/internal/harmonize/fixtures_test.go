package harmonize

import (
	"encoding/json"
	"math"
	"os"
	"path/filepath"
	"testing"
)

// The files in testdata were produced by running the team's Python proof of
// concept on real NASA monthly totals (real_monthly.json), on its noisy
// synthetic grid (synthetic_cells.json) and end to end on its fake FIRMS
// (pipeline.json). The Go port must give the same answers.

type fixtureRow struct {
	CellLat float64 `json:"cell_lat"`
	CellLon float64 `json:"cell_lon"`
	Month   string  `json:"month"`
	M       float64 `json:"m"`
	V       float64 `json:"v"`
	MDay    float64 `json:"m_day"`
	MNight  float64 `json:"m_night"`
	VDay    float64 `json:"v_day"`
	VNight  float64 `json:"v_night"`
	FM      float64 `json:"fm"`
	FV      float64 `json:"fv"`
}

type fixtureModel struct {
	Pred    []float64           `json:"pred"`
	Metrics map[string]*float64 `json:"metrics"`
}

type examCase struct {
	Train        []fixtureRow            `json:"train"`
	Exam         []fixtureRow            `json:"exam"`
	Models       map[string]fixtureModel `json:"models"`
	EnergyModels map[string]fixtureModel `json:"energy_models"`
	Unharmonized map[string]*float64     `json:"unharmonized"`
	Chosen       string                  `json:"chosen"`
	ChosenEnergy string                  `json:"chosen_energy"`
}

func loadJSON(t *testing.T, name string, v any) {
	t.Helper()
	b, err := os.ReadFile(filepath.Join("testdata", name))
	if err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(b, v); err != nil {
		t.Fatal(err)
	}
}

func toRows(t *testing.T, in []fixtureRow) []Row {
	t.Helper()
	out := make([]Row, len(in))
	for i, r := range in {
		m, err := ParseMonth(r.Month)
		if err != nil {
			t.Fatal(err)
		}
		out[i] = Row{Cell: CellOf(r.CellLat, r.CellLon), Month: m, M: r.M, V: r.V,
			MDay: r.MDay, MNight: r.MNight, VDay: r.VDay, VNight: r.VNight, FM: r.FM, FV: r.FV}
	}
	return out
}

// modelID maps the PoC's model names ("C · regresión log-log") to our IDs ("C").
func modelID(python string) ModelID { return ModelID(python[:1]) }

func examCases(t *testing.T) map[string]examCase {
	t.Helper()
	var real map[string]examCase
	loadJSON(t, "real_monthly.json", &real)
	var synth examCase
	loadJSON(t, "synthetic_cells.json", &synth)
	real["synthetic"] = synth
	return real
}

func near(got, want, rel, abs float64) bool {
	return math.Abs(got-want) <= abs+rel*math.Abs(want)
}
