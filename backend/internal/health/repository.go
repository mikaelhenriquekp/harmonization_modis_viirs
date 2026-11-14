package health

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// PostgresRepository reads health information from PostgreSQL.
type PostgresRepository struct {
	db *pgxpool.Pool
}

// NewPostgresRepository builds a repository backed by the given pool.
func NewPostgresRepository(db *pgxpool.Pool) *PostgresRepository {
	return &PostgresRepository{db: db}
}

// Ping checks database connectivity.
func (r *PostgresRepository) Ping(ctx context.Context) error {
	return r.db.Ping(ctx)
}

// MigrationVersion returns the current golang-migrate schema version.
func (r *PostgresRepository) MigrationVersion(ctx context.Context) (int64, error) {
	var version int64
	err := r.db.QueryRow(ctx, `SELECT version FROM schema_migrations LIMIT 1`).Scan(&version)
	if errors.Is(err, pgx.ErrNoRows) {
		return 0, nil
	}
	if err != nil {
		return 0, fmt.Errorf("query migration version: %w", err)
	}
	return version, nil
}

// Greeting returns the greeting seeded by the first migration.
func (r *PostgresRepository) Greeting(ctx context.Context) (string, error) {
	var greeting string
	err := r.db.QueryRow(ctx, `SELECT value FROM app_meta WHERE key = 'greeting'`).Scan(&greeting)
	if err != nil {
		return "", fmt.Errorf("query greeting: %w", err)
	}
	return greeting, nil
}
