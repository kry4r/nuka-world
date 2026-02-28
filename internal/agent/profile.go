package agent

import (
	"os"
	"path/filepath"
	"strings"
)

// ProfileDir is the base directory for agent profile files.
var ProfileDir = "agents"

// LoadProfile reads SOUL.md, Agent.md, and GOALS.md for the given agent ID
// and returns the concatenated content for system prompt injection.
func LoadProfile(agentID string) string {
	dir := filepath.Join(ProfileDir, agentID)
	files := []string{"SOUL.md", "Agent.md", "GOALS.md"}
	var parts []string
	for _, f := range files {
		data, err := os.ReadFile(filepath.Join(dir, f))
		if err != nil {
			continue
		}
		if s := strings.TrimSpace(string(data)); s != "" {
			parts = append(parts, s)
		}
	}
	if len(parts) == 0 {
		return ""
	}
	return strings.Join(parts, "\n\n---\n\n")
}

// CopyTemplate copies _template/ profile files to agents/<id>/.
func CopyTemplate(agentID string) error {
	src := filepath.Join(ProfileDir, "_template")
	dst := filepath.Join(ProfileDir, agentID)
	if err := os.MkdirAll(dst, 0o755); err != nil {
		return err
	}
	for _, f := range []string{"SOUL.md", "Agent.md", "GOALS.md"} {
		data, err := os.ReadFile(filepath.Join(src, f))
		if err != nil {
			continue
		}
		_ = os.WriteFile(filepath.Join(dst, f), data, 0o644)
	}
	return nil
}
