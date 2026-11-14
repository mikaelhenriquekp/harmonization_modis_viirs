package config

import (
	"errors"
	"fmt"
	"log/slog"
	"os"
	"strconv"
	"strings"
	"time"
)

// DefaultPriority are ingested first: the sample regions of the study
// (Iberia, Greece, Chile, Malaysia) and other large fire regimes.
const DefaultPriority = "Spain,Portugal,Greece,Chile,Malaysia,Australia,Brazil,Indonesia,United_States,Canada"

// Ingest holds the configuration of the ingest command.
type Ingest struct {
	Env         string
	DatabaseURL string
	MapKey      string
	Countries   []string // empty means every FIRMS country
	Priority    []string
	Workers     int
	Interval    time.Duration // time between runs
	Once        bool          // INGEST_INTERVAL=0: run once and exit
	RecentDays  int
	TxBudget    int // FIRMS transactions per 10 minutes the ingest may use
	LogLevel    slog.Level
}

// LoadIngest reads the ingest configuration from the environment.
func LoadIngest() (Ingest, error) {
	c := Ingest{
		Env:         getEnv("APP_ENV", "development"),
		DatabaseURL: os.Getenv("DATABASE_URL"),
		MapKey:      os.Getenv("FIRMS_MAP_KEY"),
		Countries:   list(os.Getenv("INGEST_COUNTRIES")),
		Priority:    list(getEnv("INGEST_PRIORITY", DefaultPriority)),
	}
	if c.DatabaseURL == "" {
		return Ingest{}, errors.New("DATABASE_URL is required")
	}
	if c.MapKey == "" {
		return Ingest{}, errors.New("FIRMS_MAP_KEY is required")
	}
	var err error
	if c.Workers, err = positiveInt("INGEST_WORKERS", 3); err != nil {
		return Ingest{}, err
	}
	if c.RecentDays, err = positiveInt("INGEST_RECENT_DAYS", 7); err != nil {
		return Ingest{}, err
	}
	if c.TxBudget, err = positiveInt("INGEST_TX_BUDGET", 3000); err != nil {
		return Ingest{}, err
	}
	interval := getEnv("INGEST_INTERVAL", "6h")
	if interval == "0" {
		c.Once = true
	} else if c.Interval, err = time.ParseDuration(interval); err != nil || c.Interval <= 0 {
		return Ingest{}, fmt.Errorf("invalid INGEST_INTERVAL %q", interval)
	}
	if c.LogLevel, err = parseLogLevel(getEnv("LOG_LEVEL", "info")); err != nil {
		return Ingest{}, err
	}
	return c, nil
}

// IsProduction reports whether the ingest runs in production mode.
func (c Ingest) IsProduction() bool { return c.Env == "production" }

func list(s string) []string {
	var out []string
	for _, p := range strings.Split(s, ",") {
		if p = strings.TrimSpace(p); p != "" {
			out = append(out, p)
		}
	}
	return out
}

func positiveInt(key string, fallback int) (int, error) {
	v := getEnv(key, strconv.Itoa(fallback))
	n, err := strconv.Atoi(v)
	if err != nil || n < 1 {
		return 0, fmt.Errorf("invalid %s %q", key, v)
	}
	return n, nil
}
