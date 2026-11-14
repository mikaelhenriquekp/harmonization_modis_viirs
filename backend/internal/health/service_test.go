package health

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"testing"
)

type fakeRepo struct {
	pingErr     error
	version     int64
	versionErr  error
	greeting    string
	greetingErr error
}

func (f fakeRepo) Ping(context.Context) error { return f.pingErr }
func (f fakeRepo) MigrationVersion(context.Context) (int64, error) {
	return f.version, f.versionErr
}
func (f fakeRepo) Greeting(context.Context) (string, error) { return f.greeting, f.greetingErr }

func discardLogger() *slog.Logger { return slog.New(slog.NewTextHandler(io.Discard, nil)) }

func TestServiceCheck(t *testing.T) {
	boom := errors.New("boom")
	tests := []struct {
		name string
		repo fakeRepo
		want Report
	}{
		{
			name: "healthy",
			repo: fakeRepo{version: 1, greeting: "Hello, world!"},
			want: Report{Status: StatusOK, Database: StatusOK, MigrationVersion: 1, Greeting: "Hello, world!"},
		},
		{
			name: "database down",
			repo: fakeRepo{pingErr: boom},
			want: Report{Status: StatusDown, Database: StatusDown},
		},
		{
			name: "greeting missing",
			repo: fakeRepo{version: 1, greetingErr: boom},
			want: Report{Status: StatusDegraded, Database: StatusOK, MigrationVersion: 1},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := NewService(tt.repo, discardLogger()).Check(context.Background())
			if got != tt.want {
				t.Errorf("Check() = %+v, want %+v", got, tt.want)
			}
		})
	}
}
