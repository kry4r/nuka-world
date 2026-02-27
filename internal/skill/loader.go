package skill

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// LoadFromDir scans a directory for skill plugin subdirectories.
// Each subdirectory should contain a skill.json file and optionally a prompt.md
// that overrides the prompt_fragment field. If dir doesn't exist, returns an
// empty slice without error.
func LoadFromDir(dir string) ([]*Skill, error) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, fmt.Errorf("reading skill directory %s: %w", dir, err)
	}

	var skills []*Skill
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}

		s, err := loadSkillFromSubdir(filepath.Join(dir, entry.Name()))
		if err != nil {
			return nil, fmt.Errorf("loading skill %s: %w", entry.Name(), err)
		}
		if s != nil {
			skills = append(skills, s)
		}
	}

	return skills, nil
}

func loadSkillFromSubdir(dir string) (*Skill, error) {
	jsonPath := filepath.Join(dir, "skill.json")
	data, err := os.ReadFile(jsonPath)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, fmt.Errorf("reading skill.json: %w", err)
	}

	var s Skill
	if err := json.Unmarshal(data, &s); err != nil {
		return nil, fmt.Errorf("parsing skill.json in %s: %w", dir, err)
	}
	s.Source = "plugin"

	// Optionally override prompt_fragment with prompt.md content.
	promptPath := filepath.Join(dir, "prompt.md")
	if promptData, err := os.ReadFile(promptPath); err == nil {
		s.PromptFragment = strings.TrimSpace(string(promptData))
	}

	return &s, nil
}
