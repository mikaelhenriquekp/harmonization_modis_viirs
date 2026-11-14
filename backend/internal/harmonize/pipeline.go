package harmonize

import (
	"fmt"
	"math"
	"strings"
)

// Periods of the harmonization. Aqua and Suomi NPP overlap from 2012-01-20.
var (
	LearnFrom       = MustMonth("2012-02")
	LearnTo         = MustMonth("2017-12")
	ExamFrom        = MustMonth("2018-01")
	ExamTo          = MustMonth("2021-06")
	ReconstructFrom = MustMonth("2002-07") // first full month of Aqua
	ReconstructTo   = MustMonth("2012-01")
	// ExcludedMonths are left out of learning: Aqua was down from 16 Aug to 2 Sep 2020.
	ExcludedMonths = []Month{MustMonth("2020-08")}
	handoverFrom   = MustMonth("2018-05")
)

// Thresholds of the harmonization.
const (
	MinTrainHotspots = 300 // Aqua hotspots needed to learn
	MinExamHotspots  = 150 // Aqua hotspots needed to grade
	MinR2            = 0.7 // monthly R² needed for "good" quality
	HandoverMin      = 0.85
	HandoverMax      = 1.15
)

// Status of a region's harmonization.
type Status string

// Statuses.
const (
	StatusOK           Status = "ok"
	StatusInsufficient Status = "insufficient_data"
)

// Quality of an OK harmonization.
type Quality string

// Qualities.
const (
	QualityGood   Quality = "good"
	QualityReview Quality = "review"
)

// Scope says whose data the model learned from.
type Scope string

// Scopes.
const (
	ScopeOwn      Scope = "own"      // the region's own data
	ScopeRegional Scope = "regional" // pooled with neighbors (small countries)
)

// Jump keys.
const (
	JumpRaw        = "unharmonized"
	JumpHarmonized = "harmonized"
	JumpAquaOnly   = "aqua_only"
)

// Input holds a region's per sensor summaries. Recent is VIIRS after the
// yearly archive, already restricted to the region's cells by the caller.
type Input struct {
	Name              string
	Aqua, SNPP, N20   Summary
	Recent            Summary
	RecentProvisional map[Month]bool
	ArchiveEnd        Month // last month of the yearly archive
}

// Result is a region's harmonization.
type Result struct {
	Status        Status
	Reason        string
	TrainHotspots int
	ExamHotspots  int
	Model         ModelID
	EnergyModel   ModelID
	Scope         Scope
	PooledWith    []string
	Exam          []ExamEntry
	EnergyExam    []ExamEntry
	ExamBias      float64
	ExamR2        float64
	Quality       Quality
	Warnings      []string
	Jumps         map[string]float64
	Handover      *float64 // NOAA-20 / Suomi NPP over the overlap
	Series        []Point
}

func (in Input) learnMonths() []Month { return MonthRange(LearnFrom, ExamTo) }

// learningTable is the comparison table over the learning and exam periods.
func (in Input) learningTable() []Row {
	rows := BuildTable(in.Aqua, in.SNPP, in.learnMonths())
	return filterRows(rows, func(r Row) bool { return !contains(ExcludedMonths, r.Month) })
}

func (in Input) counts() (train, exam int) {
	return int(in.Aqua.Between(LearnFrom, LearnTo, ExcludedMonths...)), int(in.Aqua.Between(ExamFrom, ExamTo, ExcludedMonths...))
}

// Harmonize harmonizes a region with its own data. A region with too little
// fire to learn from gets StatusInsufficient and no series.
func Harmonize(in Input) (Result, error) {
	train, exam := in.counts()
	if train < MinTrainHotspots || exam < MinExamHotspots || int(in.SNPP.Between(LearnFrom, LearnTo, ExcludedMonths...)) <= train {
		return Result{
			Status: StatusInsufficient, TrainHotspots: train, ExamHotspots: exam,
			Reason: fmt.Sprintf("Aqua detected %d hotspots to learn from (minimum %d) and %d to grade (minimum %d)",
				train, MinTrainHotspots, exam, MinExamHotspots),
		}, nil
	}
	res, err := harmonize(in, in.learningTable())
	if err != nil {
		return Result{}, err
	}
	res.TrainHotspots, res.ExamHotspots, res.Scope = train, exam, ScopeOwn
	return res, nil
}

// Pooled harmonizes a small region with a model learned from its own
// data pooled with its neighbors'. The series only covers the region's cells.
func Pooled(in Input, neighbors []Input) (Result, error) {
	learn := in.learningTable()
	train, exam := in.counts()
	names := make([]string, 0, len(neighbors))
	for _, n := range neighbors {
		learn = append(learn, n.learningTable()...)
		t, e := n.counts()
		train, exam = train+t, exam+e
		names = append(names, n.Name)
	}
	if train < MinTrainHotspots || exam < MinExamHotspots {
		return Result{Status: StatusInsufficient, TrainHotspots: train, ExamHotspots: exam,
			Reason: fmt.Sprintf("even pooled with %d neighbors there are only %d Aqua hotspots to learn from", len(neighbors), train)}, nil
	}
	res, err := harmonize(in, learn)
	if err != nil {
		return Result{}, err
	}
	res.TrainHotspots, res.ExamHotspots = train, exam
	res.Scope, res.PooledWith = ScopeRegional, names
	res.Warnings = append(res.Warnings, "Too little fire to learn a model of its own: harmonized with a regional model pooled with "+strings.Join(names, ", "))
	res.Quality = QualityReview
	return res, nil
}

func harmonize(in Input, learn []Row) (Result, error) {
	trainRows := filterRows(learn, func(r Row) bool { return r.Month <= LearnTo })
	examRows := filterRows(learn, func(r Row) bool { return r.Month >= ExamFrom })

	// grade the models: learn 2012–2017, grade 2018–mid 2021
	examTable := append(RunExam(CountModels, trainRows, examRows), RawEntry(examRows))
	best, err := Choose(examTable, MaxBiasPct)
	if err != nil {
		return Result{}, err
	}
	energyTable := RunExam(EnergyModels, AsEnergy(trainRows), AsEnergy(examRows))
	bestE, err := Choose(energyTable, MaxBiasPct)
	if err != nil {
		return Result{}, err
	}

	// rebuild 2002–2012 with a model fitted on the whole overlap
	past := BuildTable(in.Aqua, in.SNPP, MonthRange(ReconstructFrom, ReconstructTo))
	counts := CountModels[best].Fit(learn).Predict(past)
	energy := EnergyModels[bestE].Fit(AsEnergy(learn)).Predict(AsEnergy(past))
	pastValues := make(map[Key]Value, len(past))
	for i, r := range past {
		pastValues[Key{Cell: r.Cell, Month: r.Month}] = Value{Hotspots: counts[i], FRP: energy[i]}
	}
	segments := []Segment{
		{Values: pastValues, Source: SourceAquaHarmonized, From: ReconstructFrom, To: ReconstructTo},
		{Values: values(in.SNPP), Source: SourceSNPP, From: ReconstructTo.Add(1), To: in.ArchiveEnd},
	}
	if len(in.Recent) > 0 {
		var last Month
		for k := range in.Recent {
			last = max(last, k.Month)
		}
		segments = append(segments, Segment{Values: values(in.Recent), Source: SourceRecent, From: in.ArchiveEnd.Add(1), To: last})
	}
	series, err := Assemble(segments, in.RecentProvisional)
	if err != nil {
		return Result{}, err
	}

	res := Result{Status: StatusOK, Model: best, EnergyModel: bestE, Exam: examTable, EnergyExam: energyTable, Series: series}
	res.Jumps = in.jumps(series)
	res.Handover, res.Warnings = in.handover()
	for _, e := range examTable {
		if e.Model == best {
			res.ExamBias, res.ExamR2 = e.BiasPct, e.R2Monthly
		}
	}
	if math.Abs(res.ExamBias) > MaxBiasPct {
		res.Warnings = append(res.Warnings, fmt.Sprintf("The best model has a %.1f %% bias in the exam (limit ±%d %%)", res.ExamBias, MaxBiasPct))
	}
	if !(res.ExamR2 >= MinR2) {
		res.Warnings = append(res.Warnings, fmt.Sprintf("The best model explains little of the monthly variation in the exam (R² = %.3f, minimum %.1f)", res.ExamR2, MinR2))
	}
	res.Quality = QualityGood
	if len(res.Warnings) > 0 {
		res.Quality = QualityReview
	}
	return res, nil
}

func values(s Summary) map[Key]Value {
	out := make(map[Key]Value, len(s))
	for k, c := range s {
		out[k] = Value{Hotspots: c.N, FRP: c.FRP}
	}
	return out
}

// jumps measures the step at the 2012 sensor change before and after
// harmonizing, and in Aqua alone as the reference.
func (in Input) jumps(series []Point) map[string]float64 {
	raw, harm, aqua := map[int]float64{}, map[int]float64{}, map[int]float64{}
	for k, c := range in.Aqua {
		aqua[k.Month.Year()] += c.N
		if k.Month <= ReconstructTo {
			raw[k.Month.Year()] += c.N
		}
	}
	for k, c := range in.SNPP {
		if k.Month > ReconstructTo {
			raw[k.Month.Year()] += c.N
		}
	}
	for _, p := range series {
		if p.Month <= in.ArchiveEnd {
			harm[p.Month.Year()] += p.Hotspots
		}
	}
	return map[string]float64{JumpRaw: Jump(raw), JumpHarmonized: Jump(harm), JumpAquaOnly: Jump(aqua)}
}

// handover compares NOAA-20 with Suomi NPP over their overlap: the recent
// part of the series comes from NOAA-20, so both must agree.
func (in Input) handover() (*float64, []string) {
	if len(in.N20) == 0 || len(in.SNPP) == 0 {
		return nil, nil
	}
	var a, b float64
	for k, c := range in.SNPP {
		if k.Month >= handoverFrom && k.Month <= in.ArchiveEnd {
			a += c.N
		}
	}
	for k, c := range in.N20 {
		if k.Month >= handoverFrom && k.Month <= in.ArchiveEnd {
			b += c.N
		}
	}
	if a == 0 {
		return nil, []string{"Suomi NPP and NOAA-20 cannot be compared (no Suomi NPP data in the overlap)"}
	}
	r := round(b/a, 3)
	if r < HandoverMin || r > HandoverMax {
		return &r, []string{fmt.Sprintf("The Suomi NPP to NOAA-20 handover differs by more than 15 %% (ratio %.3f)", r)}
	}
	return &r, nil
}

func filterRows(rows []Row, keep func(Row) bool) []Row {
	out := make([]Row, 0, len(rows))
	for _, r := range rows {
		if keep(r) {
			out = append(out, r)
		}
	}
	return out
}
