// Command api runs the HTTP API server.
package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/nasa-challenge/app/backend/internal/calendar"
	"github.com/nasa-challenge/app/backend/internal/config"
	"github.com/nasa-challenge/app/backend/internal/database"
	"github.com/nasa-challenge/app/backend/internal/firemap"
	"github.com/nasa-challenge/app/backend/internal/firms"
	"github.com/nasa-challenge/app/backend/internal/health"
	"github.com/nasa-challenge/app/backend/internal/hotspots"
	"github.com/nasa-challenge/app/backend/internal/regions"
	"github.com/nasa-challenge/app/backend/internal/server"
	"github.com/nasa-challenge/app/backend/migrations"
)

func main() {
	if err := run(); err != nil {
		slog.Error("fatal", "error", err)
		os.Exit(1)
	}
}

func run() error {
	cfg, err := config.Load()
	if err != nil {
		return fmt.Errorf("load config: %w", err)
	}

	log := newLogger(cfg)
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

	healthHandler := health.NewHandler(health.NewService(health.NewPostgresRepository(db), log))
	calendarHandler := calendar.NewHandler(calendar.NewService(calendar.NewPostgresRepository(db), time.Now), time.Now)
	regionsHandler := regions.NewHandler(regions.NewService(regions.NewPostgresRepository(db)))
	mapHandler := firemap.NewHandler(firemap.NewService(firemap.NewPostgresRepository(db)), time.Now)
	hotspotsHandler := hotspots.NewHandler(nil, time.Now)
	if cfg.MapKey != "" {
		client := firms.NewClient(cfg.MapKey)
		client.Retries, client.LimitRetries = 2, 0 // answer users fast instead of waiting out the key's limit
		hotspotsHandler = hotspots.NewHandler(hotspots.NewService(client), time.Now)
	} else {
		log.Warn("FIRMS_MAP_KEY is not set: raw hotspot downloads are disabled")
	}

	srv := &http.Server{
		Addr:              net.JoinHostPort("", cfg.Port),
		Handler:           server.NewRouter(log, healthHandler, calendarHandler, regionsHandler, mapHandler, hotspotsHandler),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      60 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	errCh := make(chan error, 1)
	go func() {
		log.Info("api listening", "addr", srv.Addr, "env", cfg.Env)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			errCh <- err
		}
		close(errCh)
	}()

	select {
	case err := <-errCh:
		return fmt.Errorf("http server: %w", err)
	case <-ctx.Done():
	}

	log.Info("shutting down")
	shutdownCtx, cancel := context.WithTimeout(context.Background(), cfg.ShutdownTimeout)
	defer cancel()
	return srv.Shutdown(shutdownCtx)
}

func newLogger(cfg config.Config) *slog.Logger {
	opts := &slog.HandlerOptions{Level: cfg.LogLevel}
	if cfg.IsProduction() {
		return slog.New(slog.NewJSONHandler(os.Stdout, opts))
	}
	return slog.New(slog.NewTextHandler(os.Stdout, opts))
}
