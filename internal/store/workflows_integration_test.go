//go:build integration

package store

import (
	"context"
	"os"
	"testing"

	"go.uber.org/zap"
)

func TestWorkflowPackCRUD(t *testing.T) {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		t.Skip("DATABASE_URL not set")
	}
	s, err := New(dsn, zap.NewNop())
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	if err := s.Migrate(context.Background(), "migrations"); err != nil {
		t.Fatal(err)
	}

	p := `{"id":"p1","name":"demo","version":1,"policies":{"decision_mode":"manual"},"nodes":[]}`
	id, err := s.UpsertWorkflowPack(context.Background(), "p1", "demo", []string{"demo"}, p)
	if err != nil {
		t.Fatal(err)
	}
	if id == "" {
		t.Fatalf("expected non-empty id")
	}

	got, err := s.GetWorkflowPackJSON(context.Background(), "p1")
	if err != nil {
		t.Fatal(err)
	}
	if got == "" {
		t.Fatalf("expected json")
	}
}

