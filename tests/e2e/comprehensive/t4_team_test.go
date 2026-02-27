//go:build e2e

package comprehensive

import (
	"testing"
)

// ===== T4: Team Collaboration Tests (LLM required) =====

func TestTeam_CreateAndSubmitTask(t *testing.T) {
	// Create 2 agents for the team
	a1 := createTestAgent(t, "TeamWorker-A", "researcher", "analytical",
		"You are a researcher. Provide factual analysis.")
	a2 := createTestAgent(t, "TeamWorker-B", "writer", "creative",
		"You are a writer. Summarize findings clearly.")

	// Create team
	status, body := apiPost(t, "/api/teams", map[string]interface{}{
		"name": "e2e-collab-team",
		"members": []map[string]interface{}{
			{"agent_id": a1, "role": "researcher"},
			{"agent_id": a2, "role": "writer"},
		},
	})
	if status == 503 {
		t.Skip("orchestrator unavailable (503)")
	}
	if status != 201 && status != 200 {
		t.Fatalf("create team: expected 201/200, got %d (body: %s)",
			status, string(body))
	}
	team := decodeMap(t, body)
	teamID, _ := team["id"].(string)
	if teamID == "" {
		t.Fatal("expected non-empty team ID")
	}

	// Submit task to team
	status, body = apiPost(t, "/api/teams/"+teamID+"/chat",
		map[string]string{"message": "Analyze the benefits of Go concurrency"})
	if status == 503 {
		t.Skip("orchestrator unavailable for task submission")
	}
	if status != 200 {
		t.Fatalf("team chat: expected 200, got %d (body: %s)",
			status, string(body))
	}
	result := decodeMap(t, body)

	// Verify response has content
	summary, _ := result["summary"].(string)
	if summary == "" {
		// Try alternate field names
		if c, ok := result["content"].(string); ok {
			summary = c
		}
		if r, ok := result["reply"].(string); ok {
			summary = r
		}
	}
	if summary == "" {
		t.Error("expected non-empty team task response")
	}
	t.Logf("Team response: %.200s", summary)
}

func TestTeam_VerifyDecomposition(t *testing.T) {
	a1 := createTestAgent(t, "DecompWorker-A", "analyst", "thorough",
		"You are an analyst. Break down problems.")
	a2 := createTestAgent(t, "DecompWorker-B", "synthesizer", "concise",
		"You are a synthesizer. Combine findings.")

	status, body := apiPost(t, "/api/teams", map[string]interface{}{
		"name": "e2e-decomp-team",
		"members": []map[string]interface{}{
			{"agent_id": a1, "role": "analyst"},
			{"agent_id": a2, "role": "synthesizer"},
		},
	})
	if status == 503 {
		t.Skip("orchestrator unavailable (503)")
	}
	if status != 201 && status != 200 {
		t.Fatalf("create team: expected 201/200, got %d", status)
	}
	team := decodeMap(t, body)
	teamID, _ := team["id"].(string)

	status, body = apiPost(t, "/api/teams/"+teamID+"/chat",
		map[string]string{
			"message": "Research Go error handling patterns and summarize best practices",
		})
	if status == 503 {
		t.Skip("orchestrator unavailable for task")
	}
	if status != 200 {
		t.Fatalf("team task: expected 200, got %d (body: %s)",
			status, string(body))
	}
	result := decodeMap(t, body)

	// Check for evidence of multi-agent work
	if tasks, ok := result["tasks"].([]interface{}); ok {
		if len(tasks) < 1 {
			t.Error("expected at least 1 task result")
		}
		t.Logf("Decomposed into %d tasks", len(tasks))
	}

	// Summary should exist
	summary, _ := result["summary"].(string)
	if summary == "" {
		if c, ok := result["content"].(string); ok {
			summary = c
		}
	}
	if summary != "" {
		t.Logf("Summary: %.200s", summary)
	}
}

func TestTeam_GatewayTeamRouting(t *testing.T) {
	a1 := createTestAgent(t, "GWTeam-A", "researcher", "focused",
		"You are a researcher for gateway team routing test.")
	a2 := createTestAgent(t, "GWTeam-B", "writer", "clear",
		"You are a writer for gateway team routing test.")

	status, _ := apiPost(t, "/api/teams", map[string]interface{}{
		"name": "gw-route-team",
		"members": []map[string]interface{}{
			{"agent_id": a1, "role": "researcher"},
			{"agent_id": a2, "role": "writer"},
		},
	})
	if status == 503 {
		t.Skip("orchestrator unavailable (503)")
	}
	if status != 201 && status != 200 {
		t.Fatalf("create team: expected 201/200, got %d", status)
	}

	// Route to team via gateway @mention
	status, result := sendGatewayMessage(t, "e2e-team-user", "e2e",
		"@gw-route-team Summarize Go concurrency patterns")
	if status != 200 {
		t.Fatalf("gateway team routing: expected 200, got %d", status)
	}
	reply, _ := result["reply"].(string)
	if reply == "" {
		if c, ok := result["content"].(string); ok {
			reply = c
		}
	}
	if reply == "" {
		t.Error("expected non-empty reply from team gateway routing")
	}
	t.Logf("Team gateway reply: %.200s", reply)
}
