# Commit Squash + Comprehensive E2E Tests Design

Date: 2026-02-27

## 1. Commit Squash

### Goal
Squash 16 enhancement commits (`3e0d660..67e0eae`) into one clean commit on main.

### Method
- `git reset --soft c5db8b6` (the commit before enhancement work)
- Fix `internal/api/handler_test.go` (broken by NewHandler signature change)
- Stage all changes and create single commit:

```
feat: add slash commands, skill system, RAG integration, and tests

- Slash command framework with registry, router interception, and 10 commands
- Plugin-style skill system with 3-layer loading and per-agent assignment
- Embedding provider abstraction (API + local) with Qdrant vector store
- RAG orchestrator combining vector search across 3 collections
- Config additions for embedding, Qdrant, and skills directory
- Unit tests (command, skill, embedding) and E2E smoke tests
```

### Pre-squash Checklist
- [ ] Fix handler_test.go NewHandler signature
- [ ] Verify `go build ./...` passes
- [ ] Verify `go test ./...` passes (non-e2e)
- [ ] Perform squash
- [ ] Verify build + tests still pass after squash

## 2. Comprehensive E2E Test Suite

### Architecture
- File: `tests/e2e/comprehensive_test.go`
- Build tag: `//go:build e2e`
- Approach: Black-box HTTP against running Nuka server
- LLM: Real provider required (no mocks)
- Base URL: `NUKA_BASE_URL` env var (default `http://localhost:3210`)

### Test Tiers

#### T1 — REST API CRUD (no LLM needed)
| Test | Endpoint | Validates |
|------|----------|-----------|
| TestAPI_HealthCheck | GET /api/health | status=ok, world=nuka |
| TestAPI_ProviderCRUD | POST+GET /api/providers | Create, list, missing field 400 |
| TestAPI_AgentCRUD | POST+GET /api/agents | Create, list, get by ID, 404 |
| TestAPI_SkillCRUD | POST+GET+DELETE /api/skills | Create, list, delete, 404 |
| TestAPI_AdapterCRUD | POST+GET /api/adapters | Create, list, upsert update |
| TestAPI_WorldStatus | GET /api/world/status | world name, agent count |
| TestAPI_TeamCRUD | POST+GET /api/teams | Create team with members, list |

#### T2 — Slash Commands (some need LLM)
| Test | Command | Validates |
|------|---------|-----------|
| TestCmd_Help | /help | Contains command list |
| TestCmd_Agents | /agents | Lists "world" agent |
| TestCmd_Skills | /skills | Lists assigned skills |
| TestCmd_Status | /status | Returns world state |
| TestCmd_Search | /search query | Returns results or "no results" |
| TestCmd_CreateAgent | /create_agent | Creates agent, verifiable via /agents |
| TestCmd_CreateSkill | /create_skill | Creates skill, verifiable via /skills |

#### T3 — Multi-Agent (LLM required)
| Test | Scenario | Validates |
|------|----------|-----------|
| TestMultiAgent_CreateTwo | Create 2 agents via API | Both appear in agent list |
| TestMultiAgent_DirectChat | Chat with each via /api/agents/{id}/chat | Distinct responses per personality |
| TestMultiAgent_GatewayRouting | @agent via REST gateway | Correct agent responds |
| TestMultiAgent_FallbackRouting | No @mention via gateway | Default agent responds |

#### T4 — Team Collaboration (LLM required)
| Test | Scenario | Validates |
|------|----------|-----------|
| TestTeam_Create | POST /api/teams | Team with 2+ members created |
| TestTeam_SubmitTask | POST /api/teams/{id}/task | Non-empty aggregated response |
| TestTeam_VerifyDecomposition | Inspect task response | Evidence of multi-agent work |
| TestTeam_SessionPersistence | Check after team task | Conversation stored in DB |

### Infrastructure

```go
// TestMain: health check loop (30s timeout)
// Helpers: apiGet, apiPost, apiDelete, sendGatewayMessage
// Run command:
// NUKA_BASE_URL=http://localhost:3210 go test -tags=e2e ./tests/e2e/... -v -timeout 300s
```

### Replaces
- `internal/e2e/smoke_test.go` — removed, superseded by comprehensive suite

### Does NOT Replace
- `tests/e2e/progressive_test.go` — in-process testcontainers suite, kept for CI
- `internal/command/command_test.go` — unit tests, kept
- `internal/skill/skill_test.go` — unit tests, kept
- `internal/embedding/embedding_test.go` — unit tests, kept
