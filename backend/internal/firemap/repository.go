package firemap

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/nasa-challenge/app/backend/internal/geo"
	"github.com/nasa-challenge/app/backend/internal/harmonize"
)

// PostgresRepository reads the map from PostgreSQL.
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

// Cells sums the archive series up to the archive end and the recent days
// after it, aggregated factor x factor.
func (r *PostgresRepository) Cells(ctx context.Context, a geo.Area, from, to harmonize.Month, factor int) ([]Cell, error) {
	cond := geo.Condition(1)
	args := append(a.Args(), monthDate(from), monthDate(to), factor)
	rows, err := r.db.Query(ctx, fmt.Sprintf(`
		WITH e AS (
			SELECT COALESCE((SELECT to_date(value, 'YYYY-MM') FROM ingest_state WHERE key = 'archive_end'),
			                date_trunc('year', now())::date - interval '1 month')::date AS archive_end
		), c AS (
			SELECT cell_lat, cell_lon, hotspots, frp FROM cell_months, e
			WHERE %[1]s AND month BETWEEN $9::date AND LEAST($10::date, e.archive_end)
			UNION ALL
			SELECT cell_lat, cell_lon, hotspots, frp FROM recent_cell_days, e
			WHERE %[1]s AND day >= GREATEST($9::date, (e.archive_end + interval '1 month')::date)
			  AND day < ($10::date + interval '1 month')::date
		)
		SELECT floor(cell_lat::float8 / $11)::int, floor(cell_lon::float8 / $11)::int, sum(hotspots)::float8, sum(frp)::float8
		FROM c GROUP BY 1, 2`, cond), args...)
	if err != nil {
		return nil, fmt.Errorf("query map cells: %w", err)
	}
	var out []Cell
	var c Cell
	_, err = pgx.ForEachRow(rows, []any{&c.I, &c.J, &c.Hotspots, &c.FRP}, func() error {
		out = append(out, c)
		return nil
	})
	return out, err
}

const archiveEndSQL = `COALESCE((SELECT to_date(value, 'YYYY-MM') FROM ingest_state WHERE key = 'archive_end'),
	date_trunc('year', now())::date - interval '1 month')::date`

// SameMonth sums the requested calendar month of every year up to m.
func (r *PostgresRepository) SameMonth(ctx context.Context, a geo.Area, m harmonize.Month, factor int) ([]CellYear, error) {
	var months []time.Time
	for y := 2002; y <= m.Year(); y++ {
		months = append(months, monthDate(harmonize.NewMonth(y, m.Calendar())))
	}
	cond := geo.Condition(1)
	args := append(a.Args(), months, monthDate(m), m.Calendar(), factor)
	rows, err := r.db.Query(ctx, fmt.Sprintf(`
		WITH e AS (SELECT %[2]s AS archive_end), c AS (
			SELECT cell_lat, cell_lon, extract(year FROM month)::int AS y, hotspots FROM cell_months, e
			WHERE %[1]s AND month = ANY($9::date[]) AND month <= e.archive_end
			UNION ALL
			SELECT cell_lat, cell_lon, extract(year FROM day)::int, hotspots FROM recent_cell_days, e
			WHERE %[1]s AND extract(month FROM day) = $11 AND day >= (e.archive_end + interval '1 month')::date
			  AND day < ($10::date + interval '1 month')::date
		)
		SELECT floor(cell_lat::float8 / $12)::int, floor(cell_lon::float8 / $12)::int, y, sum(hotspots)::float8
		FROM c GROUP BY 1, 2, 3`, cond, archiveEndSQL), args...)
	if err != nil {
		return nil, fmt.Errorf("query same month: %w", err)
	}
	var out []CellYear
	var c CellYear
	_, err = pgx.ForEachRow(rows, []any{&c.I, &c.J, &c.Year, &c.Hotspots}, func() error {
		out = append(out, c)
		return nil
	})
	return out, err
}

// LastDay is the last recent day fetched, or the end of the archive.
func (r *PostgresRepository) LastDay(ctx context.Context) (time.Time, error) {
	var last time.Time
	err := r.db.QueryRow(ctx, `SELECT COALESCE((SELECT max(day) FROM recent_days),
		(`+archiveEndSQL+` + interval '1 month' - interval '1 day')::date)`).Scan(&last)
	if err != nil {
		return time.Time{}, fmt.Errorf("query last day: %w", err)
	}
	return last, nil
}
