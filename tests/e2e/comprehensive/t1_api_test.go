//go:build e2e

package comprehensive

import (
	"encoding/json"
	"fmt"
	"strings"
	"testing"
)

// ===== T1: REST API CRUD Tests (no LLM needed) =====

func TestAPI_HealthCheck(t *testing.T) {
	status, body := apiGet(t, "/api/health")
	if status != 200 {
		t.Fatalf("expected 200, got %d", status)
	}
	m := decodeMap(t, body)
	if m["status"] != "ok" {
		t.Errorf("expected status ok, got %v", m["status"])
	}
	if m["world"] != "nuka" {
		t.Errorf("expected world nuka, got %v", m["world"])
	}
}

func TestAPI_ProviderCRUD(t *testing.T) {
	// List — initially may be empty or have defaults
	status, _ := apiGet(t, "/api/providers")
	if status != 200 {
		t.Fatalf("list: expected 200, got %d", status)
	}

	// Add provider
	status, body := apiPost(t, "/api/providers", map[string]interface{}{
		"name":     "e2e-test-llm",
		"type":     "openai-compatible",
		"endpoint": "http://localhost:9999/v1",
		"api_key":  "sk-e2e-test",
		"models":   []string{"gpt-4"},
	})
	if status != 201 {
		t.Fatalf("add: expected 201, got %d (body: %s)", status, string(body))
	}
	m := decodeMap(t, body)
	if m["name"] != "e2e-test-llm" {
		t.Errorf("expected name e2e-test-llm, got %v", m["name"])
	}

	// List — should contain our provider
	status, body = apiGet(t, "/api/providers")
	if status != 200 {
		t.Fatalf("list after add: expected 200, got %d", status)
	}
	items := decodeSlice(t, body)
	found := false
	for _, item := range items {
		if p, ok := item.(map[string]interface{}); ok && p["name"] == "e2e-test-llm" {
			found = true
		}
	}
	if !found {
		t.Error("provider e2e-test-llm not found in list")
	}

	// Validation — missing name
	status, _ = apiPost(t, "/api/providers", map[string]string{"type": "x"})
	if status != 400 {
		t.Errorf("expected 400 for missing name, got %d", status)
	}
}

func TestAPI_AgentCRUD(t *testing.T) {
	// Create agent
	status, body := apiPost(t, "/api/agents", map[string]interface{}{
		"persona": map[string]interface{}{
			"name":          "E2E-Agent",
			"role":          "tester",
			"personality":   "methodical",
			"backstory":     "A test agent",
			"system_prompt": "You are a test agent.",
		},
		"provider_id": "test",
		"model":       "gpt-4",
	})
	if status != 201 {
		t.Fatalf("create: expected 201, got %d (body: %s)", status, string(body))
	}
	created := decodeMap(t, body)
	persona := created["persona"].(map[string]interface{})
	agentID := persona["id"].(string)
	if agentID == "" {
		t.Fatal("expected non-empty agent ID")
	}
	if persona["name"] != "E2E-Agent" {
		t.Errorf("expected name E2E-Agent, got %v", persona["name"])
	}

	// List — should contain our agent
	status, body = apiGet(t, "/api/agents")
	if status != 200 {
		t.Fatalf("list: expected 200, got %d", status)
	}

	// Get by ID
	status, _ = apiGet(t, "/api/agents/"+agentID)
	if status != 200 {
		t.Fatalf("get by ID: expected 200, got %d", status)
	}

	// Get non-existent — 404
	status, _ = apiGet(t, "/api/agents/nonexistent-id")
	if status != 404 {
		t.Errorf("expected 404 for missing agent, got %d", status)
	}
}

func TestAPI_SkillCRUD(t *testing.T) {
	// Add skill
	status, body := apiPost(t, "/api/skills", map[string]string{
		"name":        "e2e-web-search",
		"type":        "mcp",
		"description": "E2E test skill",
		"endpoint":    "http://localhost:3001/sse",
	})
	if status != 201 {
		t.Fatalf("add: expected 201, got %d (body: %s)", status, string(body))
	}
	var sk map[string]interface{}
	json.Unmarshal(body, &sk)
	if sk["status"] != "active" {
		t.Errorf("expected default status active, got %v", sk["status"])
	}

	// List — should contain our skill
	status, body = apiGet(t, "/api/skills")
	if status != 200 {
		t.Fatalf("list: expected 200, got %d", status)
	}
	skills := decodeSlice(t, body)
	found := false
	for _, s := range skills {
		if sm, ok := s.(map[string]interface{}); ok && sm["name"] == "e2e-web-search" {
			found = true
		}
	}
	if !found {
		t.Error("skill e2e-web-search not found in list")
	}

	// Remove
	status, _ = apiDelete(t, "/api/skills/e2e-web-search")
	if status != 200 {
		t.Fatalf("remove: expected 200, got %d", status)
	}

	// Remove non-existent — 404
	status, _ = apiDelete(t, "/api/skills/nonexistent-skill")
	if status != 404 {
		t.Errorf("expected 404 for missing skill, got %d", status)
	}

	// Validation — missing fields
	status, _ = apiPost(t, "/api/skills", map[string]string{"name": "x"})
	if status != 400 {
		t.Errorf("expected 400 for missing type, got %d", status)
	}
}

func TestAPI_AdapterCRUD(t *testing.T) {
	// Add adapter
	status, body := apiPost(t, "/api/adapters", map[string]interface{}{
		"name": "e2e-slack", "type": "slack",
		"settings": map[string]string{
			"webhook_url": "https://hooks.slack.com/e2e-test",
			"bot_token":   "xoxb-e2e",
			"channel":     "#e2e-test",
		},
	})
	if status != 200 {
		t.Fatalf("add: expected 200, got %d (body: %s)", status, string(body))
	}
	ad := decodeMap(t, body)
	if ad["status"] != "configured" {
		t.Errorf("expected status configured, got %v", ad["status"])
	}

	// List — should contain our adapter
	status, body = apiGet(t, "/api/adapters")
	if status != 200 {
		t.Fatalf("list: expected 200, got %d", status)
	}
	adapters := decodeSlice(t, body)
	if len(adapters) == 0 {
		t.Error("expected at least 1 adapter")
	}

	// Upsert — update same name
	status, _ = apiPost(t, "/api/adapters", map[string]interface{}{
		"name": "e2e-slack", "type": "slack",
		"settings": map[string]string{
			"webhook_url": "https://hooks.slack.com/e2e-updated",
			"channel":     "#e2e-updated",
		},
	})
	if status != 200 {
		t.Fatalf("upsert: expected 200, got %d", status)
	}

	// Verify upsert updated (not duplicated)
	status, body = apiGet(t, "/api/adapters")
	adapters = decodeSlice(t, body)
	count := 0
	for _, a := range adapters {
		if am, ok := a.(map[string]interface{}); ok && am["name"] == "e2e-slack" {
			count++
			settings := am["settings"].(map[string]interface{})
			if settings["channel"] != "#e2e-updated" {
				t.Errorf("expected updated channel #e2e-updated, got %v", settings["channel"])
			}
		}
	}
	if count != 1 {
		t.Errorf("expected exactly 1 e2e-slack adapter, got %d", count)
	}
}

func TestAPI_WorldStatus(t *testing.T) {
	status, body := apiGet(t, "/api/world/status")
	if status != 200 {
		t.Fatalf("expected 200, got %d", status)
	}
	ws := decodeMap(t, body)
	if ws["world"] != "Nuka World" {
		t.Errorf("expected world 'Nuka World', got %v", ws["world"])
	}
	// agent_count should be a number (may be 0 or more depending on prior tests)
	if _, ok := ws["agent_count"]; !ok {
		t.Error("expected agent_count field in world status")
	}
}

func TestAPI_TeamCRUD(t *testing.T) {
	// First create 2 agents for the team
	status, body := apiPost(t, "/api/agents", map[string]interface{}{
		"persona": map[string]interface{}{
			"name": "TeamMember1", "role": "researcher",
			"personality": "analytical", "backstory": "Test member 1",
			"system_prompt": "You are team member 1.",
		},
		"provider_id": "test", "model": "gpt-4",
	})
	if status != 201 {
		t.Fatalf("create agent 1: expected 201, got %d", status)
	}
	a1 := decodeMap(t, body)
	a1ID := a1["persona"].(map[string]interface{})["id"].(string)

	status, body = apiPost(t, "/api/agents", map[string]interface{}{
		"persona": map[string]interface{}{
			"name": "TeamMember2", "role": "writer",
			"personality": "creative", "backstory": "Test member 2",
			"system_prompt": "You are team member 2.",
		},
		"provider_id": "test", "model": "gpt-4",
	})
	if status != 201 {
		t.Fatalf("create agent 2: expected 201, got %d", status)
	}
	a2 := decodeMap(t, body)
	a2ID := a2["persona"].(map[string]interface{})["id"].(string)

	// Create team
	status, body = apiPost(t, "/api/teams", map[string]interface{}{
		"name": "e2e-test-team",
		"members": []map[string]interface{}{
			{"agent_id": a1ID, "role": "researcher"},
			{"agent_id": a2ID, "role": "writer"},
		},
	})
	// 503 means orchestrator/Redis unavailable — skip gracefully
	if status == 503 {
		t.Skip("orchestrator unavailable (503), skipping team tests")
	}
	if status != 201 && status != 200 {
		t.Fatalf("create team: expected 201/200, got %d (body: %s)", status, string(body))
	}

	// List teams
	status, body = apiGet(t, "/api/teams")
	if status != 200 && status != 503 {
		t.Fatalf("list teams: expected 200, got %d", status)
	}
	if status == 200 {
		teams := decodeSlice(t, body)
		found := false
		for _, tm := range teams {
			if tmm, ok := tm.(map[string]interface{}); ok {
				if strings.Contains(fmt.Sprintf("%v", tmm["name"]), "e2e-test-team") {
					found = true
				}
			}
		}
		if !found {
			t.Error("team e2e-test-team not found in list")
		}
	}
}
