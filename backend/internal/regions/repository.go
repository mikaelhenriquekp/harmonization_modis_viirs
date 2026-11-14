package regions

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// PostgresRepository reads regions from PostgreSQL.
type PostgresRepository struct {
	db *pgxpool.Pool
}

// NewPostgresRepository builds a repository backed by the given pool.
func NewPostgresRepository(db *pgxpool.Pool) *PostgresRepository {
	return &PostgresRepository{db: db}
}

const summaryColumns = `id, name, status, COALESCE(reason, ''), COALESCE(scope, ''), pooled_with, COALESCE(model, ''),
	COALESCE(energy_model, ''), COALESCE(quality, ''), warnings, lon_min, lat_min, lon_max, lat_max, centroid_lat, centroid_lon,
	first_month, last_month`

type scanner interface{ Scan(dest ...any) error }

func scanSummary(row scanner, extra ...any) (Summary, error) {
	var s Summary
	var w, so, e, n, cl, cn *float64
	var first, last *time.Time
	dest := append([]any{&s.ID, &s.Name, &s.Status, &s.Reason, &s.Scope, &s.PooledWith, &s.Model, &s.EnergyModel,
		&s.Quality, &s.Warnings, &w, &so, &e, &n, &cl, &cn, &first, &last}, extra...)
	if err := row.Scan(dest...); err != nil {
		return s, err
	}
	if w != nil && so != nil && e != nil && n != nil {
		s.BBox = &[4]float64{*w, *so, *e, *n}
	}
	if cl != nil && cn != nil {
		s.Centroid = &[2]float64{*cl, *cn}
	}
	if first != nil {
		s.FirstMonth = first.Format("2006-01")
	}
	if last != nil {
		s.LastMonth = last.Format("2006-01")
	}
	return s, nil
}

// List returns every region, by name.
func (r *PostgresRepository) List(ctx context.Context) ([]Summary, error) {
	rows, err := r.db.Query(ctx, `SELECT `+summaryColumns+` FROM regions ORDER BY name`)
	if err != nil {
		return nil, fmt.Errorf("query regions: %w", err)
	}
	defer rows.Close()
	out := []Summary{}
	for rows.Next() {
		s, err := scanSummary(rows)
		if err != nil {
			return nil, fmt.Errorf("scan region: %w", err)
		}
		out = append(out, s)
	}
	return out, rows.Err()
}

// Get returns one region with its exam.
func (r *PostgresRepository) Get(ctx context.Context, id string) (Detail, error) {
	var d Detail
	var at *time.Time
	var train, exam *int
	row := r.db.QueryRow(ctx, `SELECT `+summaryColumns+`, train_hotspots, exam_hotspots, exam_bias_pct, exam_r2,
		exam, energy_exam, jumps, handover, harmonized_at FROM regions WHERE id = $1`, id)
	s, err := scanSummary(row, &train, &exam, &d.ExamBiasPct, &d.ExamR2, &d.Exam, &d.EnergyExam, &d.Jumps, &d.Handover, &at)
	if errors.Is(err, pgx.ErrNoRows) {
		return d, ErrNotFound
	}
	if err != nil {
		return d, fmt.Errorf("query region: %w", err)
	}
	d.Summary = s
	if train != nil {
		d.TrainHotspots = *train
	}
	if exam != nil {
		d.ExamHotspots = *exam
	}
	if at != nil {
		d.HarmonizedAt = at.UTC().Format(time.RFC3339)
	}
	return d, nil
}

// Coverage returns the archive end and the recent days covered.
func (r *PostgresRepository) Coverage(ctx context.Context) (Coverage, error) {
	var c Coverage
	var first, last, final *time.Time
	err := r.db.QueryRow(ctx, `
		SELECT COALESCE((SELECT value FROM ingest_state WHERE key = 'archive_end'), ''),
		       (SELECT min(day) FROM recent_days), (SELECT max(day) FROM recent_days),
		       (SELECT max(day) FROM recent_days WHERE final)`).Scan(&c.ArchiveEnd, &first, &last, &final)
	if err != nil {
		return c, fmt.Errorf("query coverage: %w", err)
	}
	for _, p := range []struct {
		t   *time.Time
		dst *string
	}{{first, &c.RecentFirstDay}, {last, &c.RecentLastDay}, {final, &c.RecentFinalTo}} {
		if p.t != nil {
			*p.dst = p.t.Format(time.DateOnly)
		}
	}
	return c, nil
}
