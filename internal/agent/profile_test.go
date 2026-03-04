package agent

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLoadProfile_UsesProfileIDWhenPresent(t *testing.T) {
	tmp := t.TempDir()
	ProfileDir = tmp
	defer func() { ProfileDir = "agents" }()

	// base profile
	base := filepath.Join(tmp, "base")
	if err := os.MkdirAll(base, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(base, "SOUL.md"), []byte("base soul"), 0o644); err != nil {
		t.Fatal(err)
	}

	// clone profile directory is intentionally missing
	got := LoadProfileWithProfileID("clone-1", "base")
	if got == "" {
		t.Fatalf("expected inherited profile, got empty")
	}
}

