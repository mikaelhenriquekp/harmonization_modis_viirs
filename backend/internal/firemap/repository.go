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
			WHERE %[1]s AND month BETWEEN $7::date AND LEAST($8::date, e.archive_end)
			UNION ALL
			SELECT cell_lat, cell_lon, hotspots, frp FROM recent_cell_days, e
			WHERE %[1]s AND day >= GREATEST($7::date, (e.archive_end + interval '1 month')::date)
			  AND day < ($8::date + interval '1 month')::date
		)
		SELECT floor(cell_lat::float8 / $9)::int, floor(cell_lon::float8 / $9)::int, sum(hotspots)::float8, sum(frp)::float8
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
