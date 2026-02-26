package store

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
	"go.uber.org/zap"
)

// Store wraps a PostgreSQL connection pool.
type Store struct {
	db     *pgxpool.Pool
	logger *zap.Logger
}

// New creates a Store with a pgx connection pool.
func New(dsn string, logger *zap.Logger) (*Store, error) {
	pool, err := pgxpool.New(context.Background(), dsn)
	if err != nil {
		return nil, fmt.Errorf("connect postgres: %w", err)
	}
	if err := pool.Ping(context.Background()); err != nil {
		pool.Close()
		return nil, fmt.Errorf("ping postgres: %w", err)
	}
	logger.Info("PostgreSQL connected")
	return &Store{db: pool, logger: logger}, nil
}

// Migrate reads and executes all .sql files from the migrations directory.
func (s *Store) Migrate(ctx context.Context, migrationsDir string) error {
	entries, err := os.ReadDir(migrationsDir)
	if err != nil {
		return fmt.Errorf("read migrations dir: %w", err)
	}

	var files []string
	for _, e := range entries {
		if !e.IsDir() && strings.HasSuffix(e.Name(), ".up.sql") {
			files = append(files, e.Name())
		}
	}
	sort.Strings(files)

	for _, f := range files {
		data, err := os.ReadFile(filepath.Join(migrationsDir, f))
		if err != nil {
			return fmt.Errorf("read migration %s: %w", f, err)
		}
		if _, err := s.db.Exec(ctx, string(data)); err != nil {
			return fmt.Errorf("exec migration %s: %w", f, err)
		}
		s.logger.Info("Migration applied", zap.String("file", f))
	}
	return nil
}

// Close shuts down the connection pool.
func (s *Store) Close() {
	s.db.Close()
}
