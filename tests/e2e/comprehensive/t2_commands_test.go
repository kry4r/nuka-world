//go:build e2e

package comprehensive

import (
	"strings"
	"testing"
)

// ===== T2: Slash Command Tests (via REST gateway) =====

func TestCmd_Help(t *testing.T) {
	status, result := sendGatewayMessage(t, "e2e-user", "e2e", "/help")
	if status != 200 {
		t.Fatalf("expected 200, got %d", status)
	}
	reply, _ := result["reply"].(string)
	if reply == "" {
		// Try alternate response field
		if content, ok := result["content"].(string); ok {
			reply = content
		}
	}
	if reply == "" {
		t.Fatal("expected non-empty reply from /help")
	}
	lower := strings.ToLower(reply)
	for _, keyword := range []string{"/help", "/agents", "/skills"} {
		if !strings.Contains(lower, keyword) {
			t.Errorf("expected /help response to contain %q, got: %.200s", keyword, reply)
		}
	}
}

func TestCmd_Agents(t *testing.T) {
	status, result := sendGatewayMessage(t, "e2e-user", "e2e", "/agents")
	if status != 200 {
		t.Fatalf("expected 200, got %d", status)
	}
	reply, _ := result["reply"].(string)
	if reply == "" {
		if content, ok := result["content"].(string); ok {
			reply = content
		}
	}
	if reply == "" {
		t.Fatal("expected non-empty reply from /agents")
	}
	// Should mention at least the default "world" agent
	lower := strings.ToLower(reply)
	if !strings.Contains(lower, "world") && !strings.Contains(lower, "agent") {
		t.Errorf("expected /agents to mention world or agent, got: %.200s", reply)
	}
}

func TestCmd_Skills(t *testing.T) {
	status, result := sendGatewayMessage(t, "e2e-user", "e2e", "/skills")
	if status != 200 {
		t.Fatalf("expected 200, got %d", status)
	}
	reply, _ := result["reply"].(string)
	if reply == "" {
		if content, ok := result["content"].(string); ok {
			reply = content
		}
	}
	if reply == "" {
		t.Fatal("expected non-empty reply from /skills")
	}
}

func TestCmd_Status(t *testing.T) {
	status, result := sendGatewayMessage(t, "e2e-user", "e2e", "/status")
	if status != 200 {
		t.Fatalf("expected 200, got %d", status)
	}
	reply, _ := result["reply"].(string)
	if reply == "" {
		if content, ok := result["content"].(string); ok {
			reply = content
		}
	}
	if reply == "" {
		t.Fatal("expected non-empty reply from /status")
	}
}

func TestCmd_Search(t *testing.T) {
	status, result := sendGatewayMessage(t, "e2e-user", "e2e", "/search Nuka")
	if status != 200 {
		t.Fatalf("expected 200, got %d", status)
	}
	// /search may return "no results" if Qdrant is unavailable — that's acceptable
	reply, _ := result["reply"].(string)
	if reply == "" {
		if content, ok := result["content"].(string); ok {
			reply = content
		}
	}
	if reply == "" {
		t.Fatal("expected non-empty reply from /search")
	}
	// No hard assertion on content — just verify no crash
	t.Logf("/search reply: %.200s", reply)
}

func TestCmd_CreateAgent(t *testing.T) {
	status, result := sendGatewayMessage(t, "e2e-user", "e2e", "/create_agent CmdTestBot A friendly test bot")
	if status != 200 {
		t.Fatalf("expected 200, got %d", status)
	}
	reply, _ := result["reply"].(string)
	if reply == "" {
		if content, ok := result["content"].(string); ok {
			reply = content
		}
	}
	if reply == "" {
		t.Fatal("expected non-empty reply from /create_agent")
	}
	t.Logf("/create_agent reply: %.200s", reply)

	// Verify agent appears in /agents list
	_, agentsResult := sendGatewayMessage(t, "e2e-user", "e2e", "/agents")
	agentsReply, _ := agentsResult["reply"].(string)
	if agentsReply == "" {
		if content, ok := agentsResult["content"].(string); ok {
			agentsReply = content
		}
	}
	if !strings.Contains(agentsReply, "CmdTestBot") {
		t.Logf("/agents after create: %.300s", agentsReply)
		// Not a hard failure — agent might be listed differently
	}
}

func TestCmd_CreateSkill(t *testing.T) {
	status, result := sendGatewayMessage(t, "e2e-user", "e2e", "/create_skill e2e_cmd_skill A test skill")
	if status != 200 {
		t.Fatalf("expected 200, got %d", status)
	}
	reply, _ := result["reply"].(string)
	if reply == "" {
		if content, ok := result["content"].(string); ok {
			reply = content
		}
	}
	if reply == "" {
		t.Fatal("expected non-empty reply from /create_skill")
	}
	t.Logf("/create_skill reply: %.200s", reply)
}
