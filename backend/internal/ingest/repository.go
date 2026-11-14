package ingest

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/nasa-challenge/app/backend/internal/harmonize"
)

// PostgresRepository stores the ingest in PostgreSQL.
type PostgresRepository struct {
	db *pgxpool.Pool
}

// NewPostgresRepository builds a repository backed by the given pool.
func NewPostgresRepository(db *pgxpool.Pool) *PostgresRepository {
	return &PostgresRepository{db: db}
}

// MonthDate is the first day of a month, in UTC.
func MonthDate(m harmonize.Month) time.Time {
	return time.Date(m.Year(), time.Month(m.Calendar()), 1, 0, 0, 0, 0, time.UTC)
}

// DateMonth is the month of a date.
func DateMonth(t time.Time) harmonize.Month { return harmonize.NewMonth(t.Year(), int(t.Month())) }

// EnsureRegions inserts the regions that do not exist yet.
func (r *PostgresRepository) EnsureRegions(ctx context.Context, ids []string) error {
	names := make([]string, len(ids))
	for i, id := range ids {
		names[i] = strings.ReplaceAll(id, "_", " ")
	}
	_, err := r.db.Exec(ctx, `
		INSERT INTO regions (id, name)
		SELECT * FROM unnest($1::text[], $2::text[])
		ON CONFLICT (id) DO NOTHING`, ids, names)
	if err != nil {
		return fmt.Errorf("ensure regions: %w", err)
	}
	return nil
}

// IngestedFiles returns the ingested archive files and their FIRMS update time.
func (r *PostgresRepository) IngestedFiles(ctx context.Context) (map[string]string, error) {
	rows, err := r.db.Query(ctx, `SELECT name, updated FROM ingest_files`)
	if err != nil {
		return nil, fmt.Errorf("query ingest files: %w", err)
	}
	out := map[string]string{}
	var name, updated string
	_, err = pgx.ForEachRow(rows, []any{&name, &updated}, func() error {
		out[name] = updated
		return nil
	})
	return out, err
}

// SaveFile replaces a sensor's year of a region and marks the file ingested.
func (r *PostgresRepository) SaveFile(ctx context.Context, f FileResult) error {
	return pgx.BeginFunc(ctx, r.db, func(tx pgx.Tx) error {
		from := MonthDate(harmonize.NewMonth(f.Year, 1))
		if _, err := tx.Exec(ctx, `
			DELETE FROM sensor_cell_months
			WHERE region_id = $1 AND sensor = $2 AND month >= $3 AND month < $4`,
			f.Region, f.Sensor, from, from.AddDate(1, 0, 0)); err != nil {
			return fmt.Errorf("delete sensor year: %w", err)
		}
		rows := make([][]any, 0, len(f.Summary))
		for k, c := range f.Summary {
			rows = append(rows, []any{f.Region, f.Sensor, int16(k.Cell.Lat), int16(k.Cell.Lon), MonthDate(k.Month),
				float32(c.N), float32(c.Day), float32(c.Night), float32(c.FRP)})
		}
		if _, err := tx.CopyFrom(ctx, pgx.Identifier{"sensor_cell_months"},
			[]string{"region_id", "sensor", "cell_lat", "cell_lon", "month", "hotspots", "day", "night", "frp"},
			pgx.CopyFromRows(rows)); err != nil {
			return fmt.Errorf("copy sensor rows: %w", err)
		}
		if len(f.Fixed) > 0 {
			lats, lons := make([]int32, len(f.Fixed)), make([]int32, len(f.Fixed))
			for i, p := range f.Fixed {
				lats[i], lons[i] = p[0], p[1]
			}
			if _, err := tx.Exec(ctx, `
				INSERT INTO fixed_sources (lat_c, lon_c)
				SELECT * FROM unnest($1::int[], $2::int[])
				ON CONFLICT DO NOTHING`, lats, lons); err != nil {
				return fmt.Errorf("insert fixed sources: %w", err)
			}
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO ingest_files (name, updated, detections) VALUES ($1, $2, $3)
			ON CONFLICT (name) DO UPDATE SET updated = EXCLUDED.updated, detections = EXCLUDED.detections, ingested_at = now()`,
			f.Name, f.Updated, f.Detections); err != nil {
			return fmt.Errorf("mark file: %w", err)
		}
		if _, err := tx.Exec(ctx, `UPDATE regions SET needs_harmonize = true, updated_at = now() WHERE id = $1`, f.Region); err != nil {
			return fmt.Errorf("mark region: %w", err)
		}
		return nil
	})
}

// LoadInput reads a region's per sensor summaries.
func (r *PostgresRepository) LoadInput(ctx context.Context, region string, archiveEnd harmonize.Month) (harmonize.Input, error) {
	in := harmonize.Input{Name: region, ArchiveEnd: archiveEnd, Aqua: harmonize.Summary{}, SNPP: harmonize.Summary{}, N20: harmonize.Summary{}}
	rows, err := r.db.Query(ctx, `
		SELECT sensor, cell_lat, cell_lon, month, hotspots, day, night, frp
		FROM sensor_cell_months WHERE region_id = $1`, region)
	if err != nil {
		return in, fmt.Errorf("query sensor rows: %w", err)
	}
	var (
		sensor             string
		lat, lon           int16
		month              time.Time
		n, day, night, frp float32
	)
	_, err = pgx.ForEachRow(rows, []any{&sensor, &lat, &lon, &month, &n, &day, &night, &frp}, func() error {
		k := harmonize.Key{Cell: harmonize.Cell{Lat: int32(lat), Lon: int32(lon)}, Month: DateMonth(month)}
		c := harmonize.Counts{N: float64(n), Day: float64(day), Night: float64(night), FRP: float64(frp)}
		switch sensor {
		case SensorAqua:
			in.Aqua[k] = c
		case SensorSNPP:
			in.SNPP[k] = c
		case SensorN20:
			in.N20[k] = c
		}
		return nil
	})
	return in, err
}

func finite(v float64) *float64 {
	if math.IsNaN(v) || math.IsInf(v, 0) {
		return nil
	}
	return &v
}

func nullable[T comparable](v T) *T {
	var zero T
	if v == zero {
		return nil
	}
	return &v
}

// SaveResult replaces a region's harmonized series and its description.
func (r *PostgresRepository) SaveResult(ctx context.Context, region string, res harmonize.Result, geo RegionGeo) error {
	exam, err := json.Marshal(res.Exam)
	if err != nil {
		return err
	}
	energyExam, err := json.Marshal(res.EnergyExam)
	if err != nil {
		return err
	}
	jumps := map[string]*float64{}
	for k, v := range res.Jumps {
		jumps[k] = finite(v)
	}
	jumpsJSON, err := json.Marshal(jumps)
	if err != nil {
		return err
	}
	pooled := res.PooledWith
	if pooled == nil {
		pooled = []string{}
	}
	warnings := res.Warnings
	if warnings == nil {
		warnings = []string{}
	}
	var first, last *time.Time
	if len(res.Series) > 0 {
		a, b := MonthDate(geo.FirstMonth), MonthDate(geo.LastMonth)
		first, last = &a, &b
	}
	var geoVals []any
	if geo.CentroidLat != 0 || geo.CentroidLon != 0 {
		geoVals = []any{geo.BBox.LatMin, geo.BBox.LatMax, geo.BBox.LonMin, geo.BBox.LonMax, geo.CentroidLat, geo.CentroidLon}
	} else {
		geoVals = []any{nil, nil, nil, nil, nil, nil}
	}
	return pgx.BeginFunc(ctx, r.db, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `DELETE FROM cell_months WHERE region_id = $1`, region); err != nil {
			return fmt.Errorf("delete series: %w", err)
		}
		rows := make([][]any, 0, len(res.Series))
		for _, p := range res.Series {
			rows = append(rows, []any{region, int16(p.Cell.Lat), int16(p.Cell.Lon), MonthDate(p.Month),
				float32(p.Hotspots), float32(p.FRP), string(p.Source)})
		}
		if _, err := tx.CopyFrom(ctx, pgx.Identifier{"cell_months"},
			[]string{"region_id", "cell_lat", "cell_lon", "month", "hotspots", "frp", "source"},
			pgx.CopyFromRows(rows)); err != nil {
			return fmt.Errorf("copy series: %w", err)
		}
		args := []any{region, string(res.Status), nullable(res.Reason), nullable(string(res.Scope)), pooled,
			nullable(string(res.Model)), nullable(string(res.EnergyModel)), nullable(string(res.Quality)), warnings,
			res.TrainHotspots, res.ExamHotspots, finite(res.ExamBias), finite(res.ExamR2), exam, energyExam, jumpsJSON, res.Handover,
			first, last}
		args = append(args, geoVals...)
		if res.Status != harmonize.StatusOK {
			args[13], args[14], args[15] = nil, nil, nil
			args[11], args[12] = nil, nil
		}
		_, err := tx.Exec(ctx, `
			UPDATE regions SET
				status = $2, reason = $3, scope = $4, pooled_with = $5, model = $6, energy_model = $7, quality = $8,
				warnings = $9, train_hotspots = $10, exam_hotspots = $11, exam_bias_pct = $12, exam_r2 = $13,
				exam = $14, energy_exam = $15, jumps = $16, handover = $17, first_month = $18, last_month = $19,
				lat_min = $20, lat_max = $21, lon_min = $22, lon_max = $23, centroid_lat = $24, centroid_lon = $25,
				needs_harmonize = false, harmonized_at = now(), updated_at = now()
			WHERE id = $1`, args...)
		if err != nil {
			return fmt.Errorf("update region: %w", err)
		}
		return nil
	})
}

// SaveError marks a region as failed.
func (r *PostgresRepository) SaveError(ctx context.Context, region, reason string) error {
	_, err := r.db.Exec(ctx, `UPDATE regions SET status = 'error', reason = $2, updated_at = now() WHERE id = $1`, region, reason)
	if err != nil {
		return fmt.Errorf("save region error: %w", err)
	}
	return nil
}

// Regions lists every region with what the service needs to pool.
func (r *PostgresRepository) Regions(ctx context.Context) ([]RegionInfo, error) {
	rows, err := r.db.Query(ctx, `
		SELECT id, status, COALESCE(scope, ''), needs_harmonize, COALESCE(train_hotspots, 0), COALESCE(exam_hotspots, 0),
		       centroid_lat, centroid_lon
		FROM regions ORDER BY id`)
	if err != nil {
		return nil, fmt.Errorf("query regions: %w", err)
	}
	var out []RegionInfo
	var ri RegionInfo
	_, err = pgx.ForEachRow(rows, []any{&ri.ID, &ri.Status, &ri.Scope, &ri.NeedsHarmonize, &ri.TrainHotspots, &ri.ExamHotspots,
		&ri.CentroidLat, &ri.CentroidLon}, func() error {
		out = append(out, ri)
		ri = RegionInfo{}
		return nil
	})
	return out, err
}

// SetState stores an ingest state value.
func (r *PostgresRepository) SetState(ctx context.Context, key, value string) error {
	_, err := r.db.Exec(ctx, `
		INSERT INTO ingest_state (key, value) VALUES ($1, $2)
		ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`, key, value)
	if err != nil {
		return fmt.Errorf("set state %s: %w", key, err)
	}
	return nil
}

// FixedSources loads the static source mask.
func (r *PostgresRepository) FixedSources(ctx context.Context) (*harmonize.FixedSources, error) {
	rows, err := r.db.Query(ctx, `SELECT lat_c, lon_c FROM fixed_sources`)
	if err != nil {
		return nil, fmt.Errorf("query fixed sources: %w", err)
	}
	m := harmonize.NewFixedSources()
	var lat, lon int32
	_, err = pgx.ForEachRow(rows, []any{&lat, &lon}, func() error {
		m.Add(float64(lat)/100, float64(lon)/100)
		return nil
	})
	return m, err
}

// RecentDays returns how every recent day was fetched.
func (r *PostgresRepository) RecentDays(ctx context.Context) (map[string]RecentDay, error) {
	rows, err := r.db.Query(ctx, `SELECT day, source, final, detections FROM recent_days`)
	if err != nil {
		return nil, fmt.Errorf("query recent days: %w", err)
	}
	out := map[string]RecentDay{}
	var day time.Time
	var d RecentDay
	_, err = pgx.ForEachRow(rows, []any{&day, &d.Source, &d.Final, &d.Detections}, func() error {
		out[day.Format(time.DateOnly)] = d
		return nil
	})
	return out, err
}

// SaveRecent replaces the rows of a window of recent days.
func (r *PostgresRepository) SaveRecent(ctx context.Context, w RecentWindow) error {
	days := make([]time.Time, len(w.Days))
	counts := make([]int32, len(w.Days))
	for i, d := range w.Days {
		t, err := time.Parse(time.DateOnly, d)
		if err != nil {
			return err
		}
		days[i], counts[i] = t, int32(w.Detections[d])
	}
	return pgx.BeginFunc(ctx, r.db, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `DELETE FROM recent_cell_days WHERE day = ANY($1)`, days); err != nil {
			return fmt.Errorf("delete recent days: %w", err)
		}
		rows := make([][]any, 0, len(w.Rows))
		for _, row := range w.Rows {
			d, err := time.Parse(time.DateOnly, row.Day)
			if err != nil {
				return err
			}
			rows = append(rows, []any{d, int16(row.Cell.Lat), int16(row.Cell.Lon), float32(row.Hotspots), float32(row.FRP), row.Provisional})
		}
		if _, err := tx.CopyFrom(ctx, pgx.Identifier{"recent_cell_days"},
			[]string{"day", "cell_lat", "cell_lon", "hotspots", "frp", "provisional"}, pgx.CopyFromRows(rows)); err != nil {
			return fmt.Errorf("copy recent rows: %w", err)
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO recent_days (day, source, final, detections)
			SELECT d, $2, $3, n FROM unnest($1::date[], $4::int[]) AS t (d, n)
			ON CONFLICT (day) DO UPDATE SET source = EXCLUDED.source, final = EXCLUDED.final,
				detections = EXCLUDED.detections, fetched_at = now()`, days, w.Source, w.Final, counts); err != nil {
			return fmt.Errorf("mark recent days: %w", err)
		}
		return nil
	})
}
