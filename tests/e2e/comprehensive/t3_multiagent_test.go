//go:build e2e

package comprehensive

import (
	"testing"
)

// ===== T3: Multi-Agent Tests (LLM required) =====

// createTestAgent is a helper that creates an agent via API and returns its ID.
func createTestAgent(t *testing.T, name, role, personality, prompt string) string {
	t.Helper()
	status, body := apiPost(t, "/api/agents", map[string]interface{}{
		"persona": map[string]interface{}{
			"name":          name,
			"role":          role,
			"personality":   personality,
			"backstory":     "Created by E2E multi-agent test",
			"system_prompt": prompt,
		},
		"provider_id": "test",
		"model":       "gpt-4",
	})
	if status != 201 {
		t.Fatalf("create agent %s: expected 201, got %d (body: %s)", name, status, string(body))
	}
	m := decodeMap(t, body)
	persona := m["persona"].(map[string]interface{})
	return persona["id"].(string)
}

func TestMultiAgent_CreateTwo(t *testing.T) {
	id1 := createTestAgent(t, "Researcher-E2E", "researcher", "analytical",
		"You are a researcher. Answer questions with facts.")
	id2 := createTestAgent(t, "Poet-E2E", "poet", "creative",
		"You are a poet. Answer everything in verse.")

	if id1 == "" || id2 == "" {
		t.Fatal("expected non-empty agent IDs")
	}
	if id1 == id2 {
		t.Error("expected distinct agent IDs")
	}

	// Verify both appear in agent list
	status, body := apiGet(t, "/api/agents")
	if status != 200 {
		t.Fatalf("list agents: expected 200, got %d", status)
	}
	agents := decodeSlice(t, body)
	names := make(map[string]bool)
	for _, a := range agents {
		if am, ok := a.(map[string]interface{}); ok {
			if p, ok := am["persona"].(map[string]interface{}); ok {
				if n, ok := p["name"].(string); ok {
					names[n] = true
				}
			}
		}
	}
	if !names["Researcher-E2E"] {
		t.Error("Researcher-E2E not found in agent list")
	}
	if !names["Poet-E2E"] {
		t.Error("Poet-E2E not found in agent list")
	}
}

func TestMultiAgent_DirectChat(t *testing.T) {
	// Create two agents with distinct personalities
	researcherID := createTestAgent(t, "DirectChat-Researcher", "researcher", "factual",
		"You are a researcher. Always mention 'research' in your replies.")
	poetID := createTestAgent(t, "DirectChat-Poet", "poet", "poetic",
		"You are a poet. Always reply in verse with rhymes.")

	// Chat with researcher
	status, body := apiPost(t, "/api/agents/"+researcherID+"/chat",
		map[string]string{"message": "Tell me about yourself"})
	if status != 200 {
		t.Fatalf("chat with researcher: expected 200, got %d (body: %s)", status, string(body))
	}
	r1 := decodeMap(t, body)
	reply1, _ := r1["content"].(string)
	if reply1 == "" {
		if r, ok := r1["reply"].(string); ok {
			reply1 = r
		}
	}
	if reply1 == "" {
		t.Error("expected non-empty response from researcher")
	}
	t.Logf("Researcher reply: %.150s", reply1)

	// Chat with poet
	status, body = apiPost(t, "/api/agents/"+poetID+"/chat",
		map[string]string{"message": "Tell me about yourself"})
	if status != 200 {
		t.Fatalf("chat with poet: expected 200, got %d (body: %s)", status, string(body))
	}
	r2 := decodeMap(t, body)
	reply2, _ := r2["content"].(string)
	if reply2 == "" {
		if r, ok := r2["reply"].(string); ok {
			reply2 = r
		}
	}
	if reply2 == "" {
		t.Error("expected non-empty response from poet")
	}
	t.Logf("Poet reply: %.150s", reply2)
}

func TestMultiAgent_GatewayRouting(t *testing.T) {
	// Create a named agent for @mention routing
	createTestAgent(t, "GW-Router-Agent", "assistant", "helpful",
		"You are GW-Router-Agent. Always include 'GW-Router' in your response.")

	// Send @mention via gateway
	status, result := sendGatewayMessage(t, "e2e-gw-user", "e2e",
		"@GW-Router-Agent Hello, are you there?")
	if status != 200 {
		t.Fatalf("gateway @mention: expected 200, got %d", status)
	}
	reply, _ := result["reply"].(string)
	if reply == "" {
		if c, ok := result["content"].(string); ok {
			reply = c
		}
	}
	if reply == "" {
		t.Error("expected non-empty reply from @mention routing")
	}
	t.Logf("Gateway @mention reply: %.200s", reply)
}

func TestMultiAgent_FallbackRouting(t *testing.T) {
	// Send message without @mention — should route to default agent
	status, result := sendGatewayMessage(t, "e2e-fallback-user", "e2e",
		"Hello, who am I talking to?")
	if status != 200 {
		t.Fatalf("fallback routing: expected 200, got %d", status)
	}
	reply, _ := result["reply"].(string)
	if reply == "" {
		if c, ok := result["content"].(string); ok {
			reply = c
		}
	}
	if reply == "" {
		t.Error("expected non-empty reply from fallback routing")
	}
	t.Logf("Fallback reply: %.200s", reply)
}
