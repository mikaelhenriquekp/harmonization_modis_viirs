package harmonize

import (
	"math"
	"testing"
)

type pipelineCase struct {
	Summaries map[string][][]any `json:"summaries"`
	State     map[string]any     `json:"state"`
	Series    *struct {
		Cells  [][2]float64 `json:"cells"`
		Months []string     `json:"months"`
		Data   [][4]float64 `json:"data"`
		Meta   struct {
			Model       string                `json:"modelo"`
			EnergyModel string                `json:"modelo_energia"`
			Exam        []map[string]*float64 `json:"-"`
			Jumps       map[string]*float64   `json:"saltos"`
			Handover    *float64              `json:"relevo_noaa20_sobre_snpp"`
		} `json:"meta"`
	} `json:"series"`
}

func summaryOf(t *testing.T, rows [][]any) Summary {
	t.Helper()
	s := Summary{}
	for _, r := range rows {
		k := Key{Cell: CellOf(r[0].(float64), r[1].(float64)), Month: MustMonth(r[2].(string))}
		c := s[k]
		c.N += r[3].(float64)
		c.Day += r[4].(float64)
		c.Night += r[5].(float64)
		c.FRP += r[6].(float64)
		s[k] = c
	}
	return s
}

func pipelineInput(t *testing.T, c pipelineCase) Input {
	t.Helper()
	return Input{
		Aqua: summaryOf(t, c.Summaries["AQUA"]), SNPP: summaryOf(t, c.Summaries["SNPP"]), N20: summaryOf(t, c.Summaries["N20"]),
		ArchiveEnd: MustMonth("2025-12"),
	}
}

func TestPipelineMatchesProofOfConcept(t *testing.T) {
	var cases map[string]pipelineCase
	loadJSON(t, "pipeline.json", &cases)

	t.Run("ok region", func(t *testing.T) {
		c := cases["prueba"]
		got, err := Harmonize(pipelineInput(t, c))
		if err != nil {
			t.Fatal(err)
		}
		if got.Status != StatusOK || got.Quality != QualityGood || len(got.Warnings) != 0 {
			t.Errorf("status=%s quality=%s warnings=%v", got.Status, got.Quality, got.Warnings)
		}
		if float64(got.TrainHotspots) != c.State["focos_aqua_aprender"].(float64) || float64(got.ExamHotspots) != c.State["focos_aqua_examen"].(float64) {
			t.Errorf("train/exam hotspots = %v/%v", got.TrainHotspots, got.ExamHotspots)
		}
		if got.Model != modelID(c.Series.Meta.Model) || got.EnergyModel != modelID(c.Series.Meta.EnergyModel) {
			t.Errorf("models = %s/%s, want %s/%s", got.Model, got.EnergyModel, c.Series.Meta.Model, c.Series.Meta.EnergyModel)
		}
		if got.ExamBias != c.State["sesgo_examen"].(float64) || got.ExamR2 != c.State["r2_examen"].(float64) {
			t.Errorf("exam bias/r2 = %v/%v", got.ExamBias, got.ExamR2)
		}
		for py, key := range map[string]string{"sin armonizar": JumpRaw, "armonizada": JumpHarmonized, "referencia (solo Aqua)": JumpAquaOnly} {
			if w := c.Series.Meta.Jumps[py]; math.Abs(round(got.Jumps[key], 3)-*w) > 1e-9 {
				t.Errorf("jump %s = %v, want %v", key, got.Jumps[key], *w)
			}
		}
		if got.Handover == nil || math.Abs(*got.Handover-*c.Series.Meta.Handover) > 1e-9 {
			t.Errorf("handover = %v, want %v", got.Handover, *c.Series.Meta.Handover)
		}

		want := map[Key][2]float64{}
		for _, d := range c.Series.Data {
			cell := c.Series.Cells[int(d[0])]
			want[Key{Cell: CellOf(cell[0], cell[1]), Month: MustMonth(c.Series.Months[int(d[1])])}] = [2]float64{d[2], d[3]}
		}
		if len(got.Series) != len(want) {
			t.Fatalf("series has %d points, want %d", len(got.Series), len(want))
		}
		for _, p := range got.Series {
			w, ok := want[Key{Cell: p.Cell, Month: p.Month}]
			if !ok {
				t.Fatalf("unexpected point %+v", p)
			}
			if math.Abs(round(p.Hotspots, 1)-w[0]) > 1e-9 || math.Abs(round(p.FRP, 1)-w[1]) > 0.1+1e-9 {
				t.Fatalf("point %s %v = %.3f/%.3f, want %v", p.Month, p.Cell, p.Hotspots, p.FRP, w)
			}
		}
	})

	t.Run("insufficient data", func(t *testing.T) {
		c := cases["islote"]
		got, err := Harmonize(pipelineInput(t, c))
		if err != nil {
			t.Fatal(err)
		}
		if got.Status != StatusInsufficient || got.Reason == "" || len(got.Series) != 0 {
			t.Errorf("got %+v", got)
		}
		if got.TrainHotspots != 22 || got.ExamHotspots != 10 {
			t.Errorf("train/exam = %v/%v", got.TrainHotspots, got.ExamHotspots)
		}
	})
}

func TestPipelineAppendsRecentMonths(t *testing.T) {
	var cases map[string]pipelineCase
	loadJSON(t, "pipeline.json", &cases)
	in := pipelineInput(t, cases["prueba"])
	in.Recent = Summary{}
	d := viirsRow()
	d.Lat, d.Lon, d.Date, d.HasType = 38.3, -1.3, "2026-11-05", false
	in.Recent.Add(d)
	d.Date = "2026-03-05"
	in.Recent.Add(d)
	in.RecentProvisional = map[Month]bool{MustMonth("2026-11"): true}
	got, err := Harmonize(in)
	if err != nil {
		t.Fatal(err)
	}
	last := got.Series[len(got.Series)-1]
	if last.Month != MustMonth("2026-11") || last.Source != SourceRecent || !last.Provisional || last.Hotspots != 1 {
		t.Errorf("last point = %+v", last)
	}
}

func TestPooledHarmonizationForSmallCountry(t *testing.T) {
	var cases map[string]pipelineCase
	loadJSON(t, "pipeline.json", &cases)
	small, big := pipelineInput(t, cases["islote"]), pipelineInput(t, cases["prueba"])
	got, err := Pooled(small, []Input{big})
	if err != nil {
		t.Fatal(err)
	}
	if got.Status != StatusOK || got.Scope != ScopeRegional || len(got.Series) == 0 {
		t.Fatalf("status=%s scope=%s points=%d", got.Status, got.Scope, len(got.Series))
	}
	for _, p := range got.Series {
		lat, lon := p.Cell.Center()
		if lat > 11 || lon > 11 {
			t.Fatalf("pooled series leaked a neighbor cell: %+v", p)
		}
	}
	if len(got.Warnings) == 0 {
		t.Error("pooled result should warn that a regional model was used")
	}
}
