//go:build e2e

package e2e

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"testing"
	"time"
)

var baseURL string

func TestMain(m *testing.M) {
	baseURL = os.Getenv("NUKA_BASE_URL")
	if baseURL == "" {
		baseURL = "http://localhost:3210"
	}

	// Wait for server readiness (up to 30s)
	ready := false
	for i := 0; i < 30; i++ {
		resp, err := http.Get(baseURL + "/api/health")
		if err == nil {
			resp.Body.Close()
			if resp.StatusCode == http.StatusOK {
				ready = true
				break
			}
		}
		time.Sleep(1 * time.Second)
	}
	if !ready {
		fmt.Fprintf(os.Stderr, "server at %s not ready after 30s\n", baseURL)
		os.Exit(1)
	}

	os.Exit(m.Run())
}

// messageRequest is the payload sent to the REST gateway.
type messageRequest struct {
	UserID   string `json:"user_id"`
	UserName string `json:"user_name"`
	Content  string `json:"content"`
}

// messageResponse is the outbound message returned by the REST gateway.
type messageResponse struct {
	Platform  string `json:"platform"`
	ChannelID string `json:"channel_id"`
	AgentID   string `json:"agent_id,omitempty"`
	Content   string `json:"content"`
	ReplyTo   string `json:"reply_to,omitempty"`
}

// sendMessage POSTs a chat message through the REST gateway and returns the response content.
func sendMessage(t *testing.T, content string) string {
	t.Helper()

	body, err := json.Marshal(messageRequest{
		UserID:   "smoke-test",
		UserName: "smokebot",
		Content:  content,
	})
	if err != nil {
		t.Fatalf("marshal request: %v", err)
	}

	client := &http.Client{Timeout: 90 * time.Second}
	resp, err := client.Post(
		baseURL+"/api/gateway/rest/message",
		"application/json",
		bytes.NewReader(body),
	)
	if err != nil {
		t.Fatalf("POST /api/gateway/rest/message: %v", err)
	}
	defer resp.Body.Close()

	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatalf("read response body: %v", err)
	}

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("unexpected status %d: %s", resp.StatusCode, string(raw))
	}

	var msg messageResponse
	if err := json.Unmarshal(raw, &msg); err != nil {
		t.Fatalf("unmarshal response: %v (body: %s)", err, string(raw))
	}
	return msg.Content
}

func TestSlashHelp(t *testing.T) {
	reply := sendMessage(t, "/help")
	if !strings.Contains(reply, "/help") {
		t.Errorf("expected response to contain '/help', got: %s", reply)
	}
	t.Logf("reply: %.200s", reply)
}

func TestSlashAgents(t *testing.T) {
	reply := sendMessage(t, "/agents")
	if !strings.Contains(strings.ToLower(reply), "world") {
		t.Errorf("expected response to contain 'world', got: %s", reply)
	}
	t.Logf("reply: %.200s", reply)
}

func TestSlashSkills(t *testing.T) {
	reply := sendMessage(t, "/skills")
	if len(reply) == 0 {
		t.Error("expected non-empty response for /skills")
	}
	t.Logf("reply: %.200s", reply)
}

func TestSlashStatus(t *testing.T) {
	reply := sendMessage(t, "/status")
	if len(reply) == 0 {
		t.Error("expected non-empty response for /status")
	}
	t.Logf("reply: %.200s", reply)
}

func TestCreateAgent(t *testing.T) {
	reply := sendMessage(t, "/create_agent 一个喜欢讲笑话的助手")
	lower := strings.ToLower(reply)
	if !strings.Contains(lower, "creat") && !strings.Contains(lower, "创建") && !strings.Contains(lower, "agent") {
		t.Errorf("expected creation confirmation, got: %s", reply)
	}
	t.Logf("reply: %.200s", reply)
}

func TestPlainMessage(t *testing.T) {
	reply := sendMessage(t, "你好，请介绍一下你自己")
	if len(reply) <= 10 {
		t.Errorf("expected meaningful response (len > 10), got len=%d: %s", len(reply), reply)
	}
	t.Logf("reply: %.300s", reply)
}

func TestSearchCommand(t *testing.T) {
	reply := sendMessage(t, "/search Nuka World")
	lower := strings.ToLower(reply)
	if strings.Contains(lower, "error") && !strings.Contains(lower, "no results") {
		t.Errorf("unexpected error in response: %s", reply)
	}
	t.Logf("reply: %.200s", reply)
}
