package config

import (
	"slices"
	"testing"
	"time"
)

func TestLoadIngest(t *testing.T) {
	tests := []struct {
		name    string
		env     map[string]string
		want    func(Ingest) bool
		wantErr bool
	}{
		{
			name: "defaults",
			env:  map[string]string{"DATABASE_URL": "postgres://x", "FIRMS_MAP_KEY": "k"},
			want: func(c Ingest) bool {
				return c.Workers == 3 && c.Interval == 6*time.Hour && c.RecentDays == 7 && len(c.Countries) == 0 &&
					c.Priority[0] == "Spain" && !c.Once
			},
		},
		{
			name: "overrides",
			env: map[string]string{"DATABASE_URL": "postgres://x", "FIRMS_MAP_KEY": "k", "INGEST_COUNTRIES": "Spain, Portugal",
				"INGEST_PRIORITY": "Portugal", "INGEST_WORKERS": "5", "INGEST_INTERVAL": "0", "INGEST_RECENT_DAYS": "3"},
			want: func(c Ingest) bool {
				return c.Workers == 5 && c.Once && c.RecentDays == 3 &&
					slices.Equal(c.Countries, []string{"Spain", "Portugal"}) && slices.Equal(c.Priority, []string{"Portugal"})
			},
		},
		{name: "no database", env: map[string]string{"FIRMS_MAP_KEY": "k"}, wantErr: true},
		{name: "no map key", env: map[string]string{"DATABASE_URL": "postgres://x"}, wantErr: true},
		{name: "bad workers", env: map[string]string{"DATABASE_URL": "postgres://x", "FIRMS_MAP_KEY": "k", "INGEST_WORKERS": "zero"}, wantErr: true},
		{name: "bad interval", env: map[string]string{"DATABASE_URL": "postgres://x", "FIRMS_MAP_KEY": "k", "INGEST_INTERVAL": "soon"}, wantErr: true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			for _, k := range []string{"DATABASE_URL", "FIRMS_MAP_KEY", "INGEST_COUNTRIES", "INGEST_PRIORITY", "INGEST_WORKERS", "INGEST_INTERVAL", "INGEST_RECENT_DAYS"} {
				t.Setenv(k, tt.env[k])
			}
			got, err := LoadIngest()
			if tt.wantErr {
				if err == nil {
					t.Fatal("want error")
				}
				return
			}
			if err != nil {
				t.Fatal(err)
			}
			if !tt.want(got) {
				t.Errorf("got %+v", got)
			}
		})
	}
}
