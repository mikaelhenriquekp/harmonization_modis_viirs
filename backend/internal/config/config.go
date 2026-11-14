// Package config loads application configuration from environment variables.
package config

import (
	"errors"
	"fmt"
	"log/slog"
	"os"
	"strings"
	"time"
)

// Config holds all runtime configuration for the API.
type Config struct {
	Env             string
	Port            string
	DatabaseURL     string
	MapKey          string // optional: enables raw hotspot downloads
	LogLevel        slog.Level
	ShutdownTimeout time.Duration
}

// Load reads configuration from the environment, applying defaults where sensible.
func Load() (Config, error) {
	cfg := Config{
		Env:             getEnv("APP_ENV", "development"),
		Port:            getEnv("PORT", "8080"),
		DatabaseURL:     os.Getenv("DATABASE_URL"),
		MapKey:          os.Getenv("FIRMS_MAP_KEY"),
		ShutdownTimeout: 10 * time.Second,
	}

	if cfg.DatabaseURL == "" {
		return Config{}, errors.New("DATABASE_URL is required")
	}

	level, err := parseLogLevel(getEnv("LOG_LEVEL", "info"))
	if err != nil {
		return Config{}, err
	}
	cfg.LogLevel = level

	return cfg, nil
}

// IsProduction reports whether the app runs in production mode.
func (c Config) IsProduction() bool {
	return c.Env == "production"
}

func getEnv(key, fallback string) string {
	if v, ok := os.LookupEnv(key); ok && v != "" {
		return v
	}
	return fallback
}

func parseLogLevel(s string) (slog.Level, error) {
	var level slog.Level
	if err := level.UnmarshalText([]byte(strings.ToUpper(s))); err != nil {
		return 0, fmt.Errorf("invalid LOG_LEVEL %q: %w", s, err)
	}
	return level, nil
}
