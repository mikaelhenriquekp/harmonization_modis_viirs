// Package config loads application configuration from environment variables.
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

// Config holds all runtime configuration for the API.
type Config struct {
	Env             string
	Port            string
	DatabaseURL     string
	MapKey          string // optional: enables raw hotspot downloads
	OpenAIKey       string // optional: enables Ember, the assistant
	OpenAIModel     string
	OpenAIEffort    string // reasoning effort of the model, empty to not send it
	AskPerHour      int    // questions per client an hour, 0 for no limit
	AskBurst        int
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
		OpenAIKey:       os.Getenv("OPENAI_API_KEY"),
		OpenAIModel:     getEnv("OPENAI_MODEL", "gpt-5.4-mini"),
		OpenAIEffort:    getEnv("OPENAI_REASONING_EFFORT", "none"),
		ShutdownTimeout: 10 * time.Second,
	}

	var err error
	if cfg.DatabaseURL == "" {
		return Config{}, errors.New("DATABASE_URL is required")
	}

	if cfg.AskPerHour, err = getInt("ASSISTANT_PER_HOUR", 20); err != nil {
		return Config{}, err
	}
	if cfg.AskBurst, err = getInt("ASSISTANT_BURST", 5); err != nil {
		return Config{}, err
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

func getInt(key string, fallback int) (int, error) {
	v := getEnv(key, "")
	if v == "" {
		return fallback, nil
	}
	n, err := strconv.Atoi(v)
	if err != nil || n < 0 {
		return 0, fmt.Errorf("invalid %s %q: must be a whole number >= 0", key, v)
	}
	return n, nil
}

func parseLogLevel(s string) (slog.Level, error) {
	var level slog.Level
	if err := level.UnmarshalText([]byte(strings.ToUpper(s))); err != nil {
		return 0, fmt.Errorf("invalid LOG_LEVEL %q: %w", s, err)
	}
	return level, nil
}
