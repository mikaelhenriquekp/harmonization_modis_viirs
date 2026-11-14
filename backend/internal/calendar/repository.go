package calendar

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/nasa-challenge/app/backend/internal/geo"
	"github.com/nasa-challenge/app/backend/internal/harmonize"
)

// PostgresRepository reads the harmonized series from PostgreSQL.
type PostgresRepository struct {
	db *pgxpool.Pool
}

// NewPostgresRepository builds a repository backed by the given pool.
func NewPostgresRepository(db *pgxpool.Pool) *PostgresRepository {
	return &PostgresRepository{db: db}
}

func monthDate(m harmonize.Month) time.Time {
	return time.Date(m.Year(), time.Month(m.Calendar()), 1, 0, 0, 0, 0, time.UTC)
}

func dateMonth(t time.Time) harmonize.Month { return harmonize.NewMonth(t.Year(), int(t.Month())) }

// MonthlyTotals sums the area's harmonized archive months up to archiveEnd
// and its recent VIIRS days after it.
func (r *PostgresRepository) MonthlyTotals(ctx context.Context, a geo.Area, from, to, archiveEnd harmonize.Month) ([]MonthTotal, error) {
	args := append(a.Args(), monthDate(from), monthDate(to), monthDate(archiveEnd))
	cond := geo.Condition(1)
	rows, err := r.db.Query(ctx, fmt.Sprintf(`
		SELECT month, sum(hotspots)::float8, sum(frp)::float8, min(source), false
		FROM cell_months
		WHERE %[1]s AND month BETWEEN $9::date AND LEAST($10::date, $11::date)
		GROUP BY month
		UNION ALL
		SELECT date_trunc('month', day)::date, sum(hotspots)::float8, sum(frp)::float8, 'viirs_recent', bool_or(provisional)
		FROM recent_cell_days
		WHERE %[1]s AND day >= GREATEST($9::date, ($11::date + interval '1 month')::date) AND day < ($10::date + interval '1 month')::date
		GROUP BY 1
		ORDER BY 1`, cond), args...)
	if err != nil {
		return nil, fmt.Errorf("query monthly totals: %w", err)
	}
	var out []MonthTotal
	var m time.Time
	var t MonthTotal
	_, err = pgx.ForEachRow(rows, []any{&m, &t.Hotspots, &t.FRP, &t.Source, &t.Provisional}, func() error {
		t.Month = dateMonth(m)
		out = append(out, t)
		return nil
	})
	return out, err
}

// SensorTotals sums the raw sensors of the area per month.
func (r *PostgresRepository) SensorTotals(ctx context.Context, a geo.Area, from, to harmonize.Month) ([]SensorTotal, error) {
	args := append(a.Args(), monthDate(from), monthDate(to))
	rows, err := r.db.Query(ctx, fmt.Sprintf(`
		SELECT sensor, month, sum(hotspots)::float8
		FROM sensor_cell_months
		WHERE %s AND month BETWEEN $9 AND $10
		GROUP BY sensor, month`, geo.Condition(1)), args...)
	if err != nil {
		return nil, fmt.Errorf("query sensor totals: %w", err)
	}
	var out []SensorTotal
	var m time.Time
	var t SensorTotal
	_, err = pgx.ForEachRow(rows, []any{&t.Sensor, &m, &t.Hotspots}, func() error {
		t.Month = dateMonth(m)
		out = append(out, t)
		return nil
	})
	return out, err
}

// ArchiveEnd is the last month of the harmonized archive.
func (r *PostgresRepository) ArchiveEnd(ctx context.Context) (harmonize.Month, error) {
	var v string
	err := r.db.QueryRow(ctx, `SELECT value FROM ingest_state WHERE key = 'archive_end'`).Scan(&v)
	if errors.Is(err, pgx.ErrNoRows) {
		return harmonize.NewMonth(time.Now().Year()-1, 12), nil
	}
	if err != nil {
		return 0, fmt.Errorf("query archive end: %w", err)
	}
	return harmonize.ParseMonth(v)
}

// LastDay is the last recent day fetched, or the end of the archive.
func (r *PostgresRepository) LastDay(ctx context.Context) (time.Time, error) {
	var last *time.Time
	if err := r.db.QueryRow(ctx, `SELECT max(day) FROM recent_days`).Scan(&last); err != nil {
		return time.Time{}, fmt.Errorf("query last day: %w", err)
	}
	if last != nil {
		return *last, nil
	}
	end, err := r.ArchiveEnd(ctx)
	if err != nil {
		return time.Time{}, err
	}
	return monthDate(end).AddDate(0, 1, -1), nil
}

// RegionsIn lists the harmonized countries whose fire extent overlaps the area.
func (r *PostgresRepository) RegionsIn(ctx context.Context, a geo.Area) ([]RegionNote, error) {
	g := a.GridBBox()
	lonCond := "lon_max > $3 AND lon_min < $4"
	if len(a.Lon) > 1 { // crosses the antimeridian: east of west or west of east
		lonCond = "(lon_max > $3 OR lon_min < $4)"
	}
	rows, err := r.db.Query(ctx, fmt.Sprintf(`
		SELECT id, name, status, COALESCE(quality, ''), COALESCE(scope, ''), COALESCE(model, ''), pooled_with, warnings
		FROM regions
		WHERE status <> 'pending' AND lat_max > $1 AND lat_min < $2 AND %s
		ORDER BY name`, lonCond), g[1], g[3], g[0], g[2])
	if err != nil {
		return nil, fmt.Errorf("query regions in area: %w", err)
	}
	out := []RegionNote{}
	var n RegionNote
	_, err = pgx.ForEachRow(rows, []any{&n.ID, &n.Name, &n.Status, &n.Quality, &n.Scope, &n.Model, &n.PooledWith, &n.Warnings}, func() error {
		out = append(out, n)
		n = RegionNote{}
		return nil
	})
	return out, err
}
