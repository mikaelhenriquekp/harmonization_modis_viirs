// Command ingest downloads NASA FIRMS hotspots, harmonizes MODIS and VIIRS per
// country and keeps the recent VIIRS days up to date. With INGEST_INTERVAL it
// runs again every interval; with INGEST_INTERVAL=0 it runs once.
package main

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/nasa-challenge/app/backend/internal/config"
	"github.com/nasa-challenge/app/backend/internal/database"
	"github.com/nasa-challenge/app/backend/internal/firms"
	"github.com/nasa-challenge/app/backend/internal/ingest"
	"github.com/nasa-challenge/app/backend/migrations"
)

func main() {
	if err := run(); err != nil {
		slog.Error("fatal", "error", err)
		os.Exit(1)
	}
}

func run() error {
	cfg, err := config.LoadIngest()
	if err != nil {
		return fmt.Errorf("load config: %w", err)
	}
	opts := &slog.HandlerOptions{Level: cfg.LogLevel}
	log := slog.New(slog.NewTextHandler(os.Stdout, opts))
	if cfg.IsProduction() {
		log = slog.New(slog.NewJSONHandler(os.Stdout, opts))
	}
	slog.SetDefault(log)

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	db, err := database.Connect(ctx, cfg.DatabaseURL, log)
	if err != nil {
		return err
	}
	defer db.Close()
	if err := database.Migrate(migrations.FS, cfg.DatabaseURL, log); err != nil {
		return err
	}

	svc := ingest.NewService(firms.NewClient(cfg.MapKey), ingest.NewPostgresRepository(db), ingest.Config{
		Countries:  cfg.Countries,
		Priority:   cfg.Priority,
		Workers:    cfg.Workers,
		RecentDays: cfg.RecentDays,
	}, log)

	for {
		start := time.Now()
		err := svc.Run(ctx)
		switch {
		case ctx.Err() != nil:
			log.Info("ingest: stopped")
			return nil
		case err != nil:
			log.Error("ingest: run failed", "error", err, "duration", time.Since(start))
			if cfg.Once {
				return err
			}
		default:
			log.Info("ingest: run finished", "duration", time.Since(start))
		}
		if cfg.Once {
			return nil
		}
		select {
		case <-ctx.Done():
			log.Info("ingest: stopped")
			return nil
		case <-time.After(cfg.Interval):
		}
	}
}
