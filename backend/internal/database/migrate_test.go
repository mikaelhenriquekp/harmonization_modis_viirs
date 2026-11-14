package database

import "testing"

func TestToPgx5URL(t *testing.T) {
	tests := map[string]string{
		"postgres://u:p@db:5432/app":   "pgx5://u:p@db:5432/app",
		"postgresql://u:p@db:5432/app": "pgx5://u:p@db:5432/app",
		"pgx5://u:p@db:5432/app":       "pgx5://u:p@db:5432/app",
	}
	for in, want := range tests {
		if got := toPgx5URL(in); got != want {
			t.Errorf("toPgx5URL(%q) = %q, want %q", in, got, want)
		}
	}
}
