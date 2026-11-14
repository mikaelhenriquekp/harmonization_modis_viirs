// Package health implements the health check feature (handler → service → repository).
package health

import (
	"context"
	"log/slog"
)

// Status values reported by the health check.
const (
	StatusOK       = "ok"
	StatusDegraded = "degraded"
	StatusDown     = "down"
)

// Repository is the data access the health service depends on.
type Repository interface {
	Ping(ctx context.Context) error
	MigrationVersion(ctx context.Context) (int64, error)
	Greeting(ctx context.Context) (string, error)
}

// Report is the result of a health check.
type Report struct {
	Status           string `json:"status"`
	Database         string `json:"database"`
	MigrationVersion int64  `json:"migration_version"`
	Greeting         string `json:"greeting,omitempty"`
}

// Healthy reports whether every dependency is fine.
func (r Report) Healthy() bool {
	return r.Status == StatusOK
}

// Service runs health checks.
type Service struct {
	repo Repository
	log  *slog.Logger
}

// NewService builds a health Service.
func NewService(repo Repository, log *slog.Logger) *Service {
	return &Service{repo: repo, log: log}
}

// Check pings the database and gathers schema information.
func (s *Service) Check(ctx context.Context) Report {
	if err := s.repo.Ping(ctx); err != nil {
		s.log.ErrorContext(ctx, "health: database ping failed", "error", err)
		return Report{Status: StatusDown, Database: StatusDown}
	}

	report := Report{Status: StatusOK, Database: StatusOK}

	version, err := s.repo.MigrationVersion(ctx)
	if err != nil {
		s.log.ErrorContext(ctx, "health: migration version", "error", err)
		report.Status = StatusDegraded
	}
	report.MigrationVersion = version

	greeting, err := s.repo.Greeting(ctx)
	if err != nil {
		s.log.ErrorContext(ctx, "health: greeting", "error", err)
		report.Status = StatusDegraded
	}
	report.Greeting = greeting

	return report
}
