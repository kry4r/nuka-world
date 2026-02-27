package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/nidhogg/nuka-world/internal/agent"
	"github.com/nidhogg/nuka-world/internal/gateway"
	"github.com/nidhogg/nuka-world/internal/provider"
	"github.com/nidhogg/nuka-world/internal/world"
	"go.uber.org/zap"
)

// newTestHandler creates a Handler wired with lightweight in-memory deps (no Neo4j/Redis).
func newTestHandler(t *testing.T) (*Handler, http.Handler) {
	t.Helper()
	logger := zap.NewNop()

	router := provider.NewRouter(logger)
	engine := agent.NewEngine(router, nil, logger)

	gw := gateway.NewGateway(logger)
	broadcaster := gateway.NewBroadcaster(gw, logger)
	restGW := gateway.NewRESTAdapter(logger)

	clock := world.NewWorldClock(time.Second, 1.0, logger)
	scheduleMgr := world.NewScheduleManager(logger)
	stateMgr := world.NewStateManager(scheduleMgr, logger)
	growth := world.NewGrowthTracker(logger)

	h := NewHandler(engine, nil, nil, broadcaster, restGW, gw, clock, scheduleMgr, stateMgr, growth, nil, logger)
	return h, h.Router()
}

func postJSON(t *testing.T, ts *httptest.Server, path string, body interface{}) *http.Response {
	t.Helper()
	b, _ := json.Marshal(body)
	resp, err := http.Post(ts.URL+path, "application/json", bytes.NewReader(b))
	if err != nil {
		t.Fatalf("POST %s: %v", path, err)
	}
	return resp
}

func getJSON(t *testing.T, ts *httptest.Server, path string) *http.Response {
	t.Helper()
	resp, err := http.Get(ts.URL + path)
	if err != nil {
		t.Fatalf("GET %s: %v", path, err)
	}
	return resp
}

func decodeJSON(t *testing.T, resp *http.Response, v interface{}) {
	t.Helper()
	defer resp.Body.Close()
	if err := json.NewDecoder(resp.Body).Decode(v); err != nil {
		t.Fatalf("decode response: %v", err)
	}
}

func deleteReq(t *testing.T, ts *httptest.Server, path string) *http.Response {
	t.Helper()
	req, _ := http.NewRequest("DELETE", ts.URL+path, nil)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("DELETE %s: %v", path, err)
	}
	return resp
}

// --- Tests ---

func TestHealthCheck(t *testing.T) {
	_, router := newTestHandler(t)
	ts := httptest.NewServer(router)
	defer ts.Close()

	resp := getJSON(t, ts, "/api/health")
	if resp.StatusCode != 200 {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
	var body map[string]string
	decodeJSON(t, resp, &body)
	if body["status"] != "ok" {
		t.Errorf("expected status ok, got %q", body["status"])
	}
	if body["world"] != "nuka" {
		t.Errorf("expected world nuka, got %q", body["world"])
	}
}

func TestProviderCRUD(t *testing.T) {
	_, router := newTestHandler(t)
	ts := httptest.NewServer(router)
	defer ts.Close()

	// List — empty
	resp := getJSON(t, ts, "/api/providers")
	if resp.StatusCode != 200 {
		t.Fatalf("list: expected 200, got %d", resp.StatusCode)
	}

	// Add provider
	resp = postJSON(t, ts, "/api/providers", map[string]interface{}{
		"name":     "test-llm",
		"type":     "openai-compatible",
		"endpoint": "http://localhost:9999/v1",
		"api_key":  "sk-test",
		"models":   []string{"gpt-4"},
	})
	if resp.StatusCode != 201 {
		t.Fatalf("add: expected 201, got %d", resp.StatusCode)
	}
	var prov ProviderConfig
	decodeJSON(t, resp, &prov)
	if prov.Name != "test-llm" {
		t.Errorf("expected name test-llm, got %q", prov.Name)
	}

	// List — should have 1
	resp = getJSON(t, ts, "/api/providers")
	var provs []ProviderConfig
	decodeJSON(t, resp, &provs)
	if len(provs) != 1 {
		t.Errorf("expected 1 provider, got %d", len(provs))
	}

	// Validation — missing name
	resp = postJSON(t, ts, "/api/providers", map[string]string{"type": "x"})
	if resp.StatusCode != 400 {
		t.Errorf("expected 400 for missing name, got %d", resp.StatusCode)
	}
	resp.Body.Close()
}

func TestSkillCRUD(t *testing.T) {
	_, router := newTestHandler(t)
	ts := httptest.NewServer(router)
	defer ts.Close()

	// Add skill
	resp := postJSON(t, ts, "/api/skills", map[string]string{
		"name": "web-search", "type": "mcp",
		"description": "Search the web", "endpoint": "http://localhost:3001/sse",
	})
	if resp.StatusCode != 201 {
		t.Fatalf("add skill: expected 201, got %d", resp.StatusCode)
	}
	var sk SkillConfig
	decodeJSON(t, resp, &sk)
	if sk.Status != "active" {
		t.Errorf("expected default status active, got %q", sk.Status)
	}

	// List — should have 1
	resp = getJSON(t, ts, "/api/skills")
	var skills []SkillConfig
	decodeJSON(t, resp, &skills)
	if len(skills) != 1 {
		t.Errorf("expected 1 skill, got %d", len(skills))
	}

	// Remove
	resp = deleteReq(t, ts, "/api/skills/web-search")
	if resp.StatusCode != 200 {
		t.Fatalf("remove skill: expected 200, got %d", resp.StatusCode)
	}
	resp.Body.Close()

	// List — should be empty
	resp = getJSON(t, ts, "/api/skills")
	decodeJSON(t, resp, &skills)
	if len(skills) != 0 {
		t.Errorf("expected 0 skills after remove, got %d", len(skills))
	}

	// Remove non-existent — 404
	resp = deleteReq(t, ts, "/api/skills/nope")
	if resp.StatusCode != 404 {
		t.Errorf("expected 404 for missing skill, got %d", resp.StatusCode)
	}
	resp.Body.Close()

	// Validation — missing fields
	resp = postJSON(t, ts, "/api/skills", map[string]string{"name": "x"})
	if resp.StatusCode != 400 {
		t.Errorf("expected 400 for missing type, got %d", resp.StatusCode)
	}
	resp.Body.Close()
}

func TestAdapterCRUD(t *testing.T) {
	_, router := newTestHandler(t)
	ts := httptest.NewServer(router)
	defer ts.Close()

	// Add adapter (Slack)
	resp := postJSON(t, ts, "/api/adapters", map[string]interface{}{
		"name": "slack-main", "type": "slack",
		"settings": map[string]string{
			"webhook_url": "https://hooks.slack.com/xxx",
			"bot_token":   "xoxb-test",
			"channel":     "#general",
		},
	})
	if resp.StatusCode != 200 {
		t.Fatalf("add adapter: expected 200, got %d", resp.StatusCode)
	}
	var ad AdapterConfig
	decodeJSON(t, resp, &ad)
	if ad.Status != "configured" {
		t.Errorf("expected default status configured, got %q", ad.Status)
	}
	if ad.Settings["channel"] != "#general" {
		t.Errorf("expected channel #general, got %q", ad.Settings["channel"])
	}

	// List — should have 1
	resp = getJSON(t, ts, "/api/adapters")
	var adapters []AdapterConfig
	decodeJSON(t, resp, &adapters)
	if len(adapters) != 1 {
		t.Errorf("expected 1 adapter, got %d", len(adapters))
	}

	// Upsert — update same name
	resp = postJSON(t, ts, "/api/adapters", map[string]interface{}{
		"name": "slack-main", "type": "slack",
		"settings": map[string]string{
			"webhook_url": "https://hooks.slack.com/yyy",
			"channel":     "#dev",
		},
	})
	if resp.StatusCode != 200 {
		t.Fatalf("upsert adapter: expected 200, got %d", resp.StatusCode)
	}
	resp.Body.Close()

	// List — still 1 (upsert, not duplicate)
	resp = getJSON(t, ts, "/api/adapters")
	decodeJSON(t, resp, &adapters)
	if len(adapters) != 1 {
		t.Errorf("expected 1 adapter after upsert, got %d", len(adapters))
	}
	if adapters[0].Settings["channel"] != "#dev" {
		t.Errorf("expected updated channel #dev, got %q", adapters[0].Settings["channel"])
	}
}

func TestAgentCRUD(t *testing.T) {
	_, router := newTestHandler(t)
	ts := httptest.NewServer(router)
	defer ts.Close()

	// List — empty
	resp := getJSON(t, ts, "/api/agents")
	if resp.StatusCode != 200 {
		t.Fatalf("list agents: expected 200, got %d", resp.StatusCode)
	}
	var agents []interface{}
	decodeJSON(t, resp, &agents)
	if len(agents) != 0 {
		t.Errorf("expected 0 agents, got %d", len(agents))
	}

	// Create agent
	resp = postJSON(t, ts, "/api/agents", map[string]interface{}{
		"persona": map[string]interface{}{
			"name":          "Nora",
			"role":          "researcher",
			"personality":   "curious",
			"backstory":     "A vault dweller",
			"system_prompt": "You are Nora.",
		},
		"provider_id": "test",
		"model":       "gpt-4",
	})
	if resp.StatusCode != 201 {
		t.Fatalf("create agent: expected 201, got %d", resp.StatusCode)
	}
	var created map[string]interface{}
	decodeJSON(t, resp, &created)

	persona := created["persona"].(map[string]interface{})
	agentID := persona["id"].(string)
	if agentID == "" {
		t.Fatal("expected non-empty agent ID")
	}
	if persona["name"] != "Nora" {
		t.Errorf("expected name Nora, got %v", persona["name"])
	}

	// Get agent
	resp = getJSON(t, ts, "/api/agents/"+agentID)
	if resp.StatusCode != 200 {
		t.Fatalf("get agent: expected 200, got %d", resp.StatusCode)
	}
	resp.Body.Close()

	// Get non-existent agent
	resp = getJSON(t, ts, "/api/agents/nonexistent")
	if resp.StatusCode != 404 {
		t.Errorf("expected 404 for missing agent, got %d", resp.StatusCode)
	}
	resp.Body.Close()
}

func TestWorldStatus(t *testing.T) {
	_, router := newTestHandler(t)
	ts := httptest.NewServer(router)
	defer ts.Close()

	resp := getJSON(t, ts, "/api/world/status")
	if resp.StatusCode != 200 {
		t.Fatalf("world status: expected 200, got %d", resp.StatusCode)
	}
	var ws map[string]interface{}
	decodeJSON(t, resp, &ws)
	if ws["world"] != "Nuka World" {
		t.Errorf("expected world 'Nuka World', got %v", ws["world"])
	}
	if ws["agent_count"].(float64) != 0 {
		t.Errorf("expected 0 agents, got %v", ws["agent_count"])
	}
}
