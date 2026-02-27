# Squash + Comprehensive E2E Tests — Implementation Plan

Date: 2026-02-27
Design: `docs/plans/2026-02-27-squash-and-e2e-design.md`

## Task Overview

| # | Task | Depends | Files |
|---|------|---------|-------|
| 1 | Fix handler_test.go | — | `internal/api/handler_test.go` |
| 2 | Verify build + tests | 1 | — |
| 3 | Squash commits | 2 | — (git operation) |
| 4 | Remove old smoke tests | 3 | `internal/e2e/smoke_test.go`, `.env.test` |
| 5 | Write E2E test helpers | 3 | `tests/e2e/comprehensive_test.go` |
| 6 | Write T1 API CRUD tests | 5 | `tests/e2e/comprehensive_test.go` |
| 7 | Write T2 slash command tests | 5 | `tests/e2e/comprehensive_test.go` |
| 8 | Write T3 multi-agent tests | 5 | `tests/e2e/comprehensive_test.go` |
| 9 | Write T4 team tests | 5 | `tests/e2e/comprehensive_test.go` |
| 10 | Verify build, commit all | 4-9 | — |

---

## Task 1: Fix handler_test.go

The `NewHandler` signature has 12 params but the test only passes 11 (missing `gw *gateway.Gateway`).

**File: `internal/api/handler_test.go`**

Replace line 35:
```go
// Before (broken — 11 params, missing gw):
h := NewHandler(engine, nil, nil, broadcaster, restGW, clock, scheduleMgr, stateMgr, growth, nil, logger)

// After (fixed — 12 params, gw added):
h := NewHandler(engine, nil, nil, broadcaster, restGW, gw, clock, scheduleMgr, stateMgr, growth, nil, logger)
```

Also add `gw` creation in `newTestHandler`:
```go
gw := gateway.NewGateway(logger)
```

---

## Task 2: Verify build + tests

```bash
go build ./...
go test ./internal/api/... ./internal/command/... ./internal/skill/... ./internal/embedding/... -v
```

All must pass before squash.

---

## Task 3: Squash commits

Squash 17 commits (`3e0d660..HEAD`) into one:

```bash
git reset --soft c5db8b6
git commit -m "feat: add slash commands, skill system, RAG integration, and tests

- Slash command framework with registry, router interception, and 10 commands
- Plugin-style skill system with 3-layer loading and per-agent assignment
- Embedding provider abstraction (API + local) with Qdrant vector store
- RAG orchestrator combining vector search across 3 collections
- Config additions for embedding, Qdrant, and skills directory
- Unit tests (command, skill, embedding) and E2E smoke tests"
```

Verify after squash:
```bash
go build ./...
go test ./internal/api/... ./internal/command/... ./internal/skill/... ./internal/embedding/... -v
```

---

## Task 4: Remove old smoke tests

Delete files superseded by the new comprehensive suite:
- `internal/e2e/smoke_test.go`
- `.env.test`

---

## Task 5: Write E2E test helpers

**File: `tests/e2e/comprehensive_test.go`**

```go
//go:build e2e

package e2e

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
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
	for i := 0; i < 30; i++ {
		resp, err := http.Get(baseURL + "/api/health")
		if err == nil {
			resp.Body.Close()
			if resp.StatusCode == http.StatusOK {
				os.Exit(m.Run())
			}
		}
		time.Sleep(1 * time.Second)
	}
	fmt.Fprintf(os.Stderr, "server at %s not ready after 30s\n", baseURL)
	os.Exit(1)
}

// --- HTTP helpers ---

func apiGet(t *testing.T, path string) (int, []byte) {
	t.Helper()
	resp, err := http.Get(baseURL + path)
	if err != nil {
		t.Fatalf("GET %s: %v", path, err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	return resp.StatusCode, body
}

func apiPost(t *testing.T, path string, payload interface{}) (int, []byte) {
	t.Helper()
	b, _ := json.Marshal(payload)
	client := &http.Client{Timeout: 120 * time.Second}
	resp, err := client.Post(baseURL+path, "application/json", bytes.NewReader(b))
	if err != nil {
		t.Fatalf("POST %s: %v", path, err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	return resp.StatusCode, body
}

func apiDelete(t *testing.T, path string) (int, []byte) {
	t.Helper()
	req, _ := http.NewRequest("DELETE", baseURL+path, nil)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("DELETE %s: %v", path, err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	return resp.StatusCode, body
}

// sendGatewayMessage sends a message through the REST gateway.
func sendGatewayMessage(t *testing.T, userID, userName, content string) (int, map[string]interface{}) {
	t.Helper()
	status, body := apiPost(t, "/api/gateway/rest/message", map[string]string{
		"user_id":   userID,
		"user_name": userName,
		"content":   content,
	})
	var result map[string]interface{}
	json.Unmarshal(body, &result)
	return status, result
}

func decodeMap(t *testing.T, body []byte) map[string]interface{} {
	t.Helper()
	var m map[string]interface{}
	if err := json.Unmarshal(body, &m); err != nil {
		t.Fatalf("decode: %v (body: %s)", err, string(body))
	}
	return m
}

func decodeSlice(t *testing.T, body []byte) []interface{} {
	t.Helper()
	var s []interface{}
	if err := json.Unmarshal(body, &s); err != nil {
		t.Fatalf("decode slice: %v (body: %s)", err, string(body))
	}
	return s
}
```

---

## Task 6: Write T1 API CRUD tests

Append to `tests/e2e/comprehensive_test.go`. 7 tests covering all REST API endpoints without LLM dependency.

Tests: `TestAPI_HealthCheck`, `TestAPI_ProviderCRUD`, `TestAPI_AgentCRUD`, `TestAPI_SkillCRUD`, `TestAPI_AdapterCRUD`, `TestAPI_WorldStatus`, `TestAPI_TeamCRUD`

Key patterns:
- Each test exercises POST (create) → GET (list/verify) → DELETE where applicable
- `TestAPI_TeamCRUD` skips gracefully if Redis/orchestrator unavailable (503)
- Validation tests: missing required fields → 400, nonexistent resources → 404

---

## Task 7: Write T2 slash command tests

Append to `tests/e2e/comprehensive_test.go`. 7 tests covering all slash commands via REST gateway.

Tests: `TestCmd_Help`, `TestCmd_Agents`, `TestCmd_Skills`, `TestCmd_Status`, `TestCmd_Search`, `TestCmd_CreateAgent`, `TestCmd_CreateSkill`

Key patterns:
- All commands sent via `sendGatewayMessage(t, "e2e-user", "e2e", "/command args")`
- `/help` → response contains "/help", "/agents", "/skills"
- `/agents` → response contains "world" (default agent)
- `/skills` → non-empty response
- `/status` → non-empty response
- `/search Nuka` → no hard error (may return "no results" if Qdrant unavailable)
- `/create_agent TestBot 友善的测试机器人` → response contains creation confirmation, then `/agents` shows new agent
- `/create_skill test_skill 测试技能` → response contains confirmation

---

## Task 8: Write T3 multi-agent tests

Append to `tests/e2e/comprehensive_test.go`. 4 tests covering multi-agent creation, direct chat, and gateway routing.

Tests: `TestMultiAgent_CreateTwo`, `TestMultiAgent_DirectChat`, `TestMultiAgent_GatewayRouting`, `TestMultiAgent_FallbackRouting`

Key patterns:
- Create 2 agents via POST /api/agents with distinct personalities (researcher vs poet)
- Direct chat via POST /api/agents/{id}/chat with `{"message": "..."}` — verify non-empty response
- Gateway routing: send `@AgentName message` via gateway, verify response comes from correct agent
- Fallback: send plain message without @mention, verify default "world" agent responds
- All tests require real LLM — no skip logic (per design decision)

---

## Task 9: Write T4 team collaboration tests

Append to `tests/e2e/comprehensive_test.go`. 3 tests covering team creation, task submission, and result verification.

Tests: `TestTeam_CreateAndSubmitTask`, `TestTeam_VerifyDecomposition`, `TestTeam_GatewayTeamRouting`

Key patterns:
- Create team via POST /api/teams with 2+ agent members
- Submit task via POST /api/teams/{id}/chat with `{"message": "..."}`
- Skip all if orchestrator unavailable (503 on team create)
- Verify response has `summary` field (StewardResult)
- Gateway team routing: `@team-name task` via REST gateway
- Timeout: 120s for team tasks (LLM calls for decomposition + execution + aggregation)

---

## Task 10: Verify build, commit all

```bash
go build ./...
go test ./internal/api/... ./internal/command/... ./internal/skill/... ./internal/embedding/... -v
```

Commit everything as a single commit on top of the squashed commit:
```
test(e2e): add comprehensive E2E test suite covering API, commands, multi-agent, and teams
```

---

## Execution Strategy

- Tasks 1-3: Sequential (fix → verify → squash)
- Task 4: After squash
- Tasks 5-9: Sequential (single file, each task appends)
- Task 10: Final verification

Recommended: **Subagent-Driven Development** is NOT ideal here since all test tasks write to the same file. Use sequential execution instead.
