# Progressive Testing Design — Nuka World Backend E2E

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:writing-plans to create the implementation plan from this design.

**Goal:** Design a bottom-up progressive test suite that validates the full agent dialogue flow — from single-agent cognitive loop to multi-agent team collaboration to gateway-level message routing.

**Architecture:** TestSuite with nested subtests (Approach C). A single `TestProgressiveFlow` orchestrates L1→L2→L3 as nested subtests sharing container state. `TestMain` starts Neo4j/PG/Redis via testcontainers-go, all subtests share the same instances.

**Tech Stack:** Go testing, testcontainers-go (Neo4j, PostgreSQL, Redis), real LLM API calls, no build tag isolation.

---

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Memory dependency | Testcontainers (real Neo4j) | Most realistic, no interface refactoring needed |
| LLM testing | Real API calls | Tests actual reasoning, tool calling, ReAct loop |
| Test isolation | None — `go test ./...` runs all | Simple, no CI complexity |
| Test structure | Approach C: TestSuite Subtests | Single progression, shared state between layers |

---

## Test Architecture

```
tests/e2e/progressive_test.go

TestProgressiveFlow(t *testing.T)
├── TestMain() — start Neo4j, PG, Redis containers; init LLM provider
├── L1_SingleAgent/
│   ├── MemoryActivation     — triggers → spreading activation → recalled nodes
│   ├── SchemaMatching       — input → match schemas → assimilate/accommodate
│   ├── ContextBuilding      — activated nodes → context blocks → token budget
│   ├── CognitiveLoop        — Engine.Execute: memory → LLM → response
│   ├── ToolExecution        — LLM → tool_calls → execute → observation → re-reason
│   └── MemoryUpdate         — response processed back into memory graph
├── L2_TeamCollaboration/
│   ├── TaskDecomposition    — Steward decomposes intent into sub-tasks
│   ├── ParallelDispatch     — Scheduler dispatches concurrently
│   └── ResultAggregation    — Steward aggregates into summary
└── L3_GatewayIntegration/
    ├── AgentRouting          — @AgentName → resolve → execute → reply
    ├── TeamRouting           — @team-Name → decompose → dispatch → reply
    ├── FallbackBehavior      — no mention → default agent / error
    └── SessionPersistence    — verify PG session + message records
```

Shared state flows downward: L1 creates agent + populates memory → L2 reuses in team → L3 routes messages to team.

---

## L1: Single Agent Cognitive Loop

### Setup
- Register a test agent with persona (name: "Nora", role: "researcher"), system prompt, model binding to real LLM
- Seed Neo4j with 3-5 schemas (e.g. "Go并发", "数据库设计", "API设计") and 10+ memories per schema
- Register a `test_calculator` tool that returns deterministic results

### Subtests

**L1/MemoryActivation**
- Call `memory.Store.Activate(ctx, agentID, ["Go", "并发", "goroutine"], opts)`
- Assert: recalled nodes include seeded memories about Go concurrency
- Assert: activation scores ordered descending, nodes below threshold excluded

**L1/SchemaMatching**
- Call `memory.Store.MatchSchemas(ctx, agentID, ["Go", "并发"])`
- Assert: top match is "Go并发" schema with score > 0.5
- Assert: results sorted by score descending

**L1/ContextBuilding**
- Call `memory.Store.BuildContext(ctx, agentID, ["Go", "并发"], budget)`
- Assert: returned blocks fit within token budget (2000 tokens)
- Assert: `FormatContextPrompt(blocks)` starts with "[Memory Context]"

**L1/CognitiveLoop**
- Call `engine.Execute(ctx, agentID, "你好，介绍一下你自己")`
- Assert: response non-empty, ThinkingChain has StepMemoryRecall + StepReasoning + StepResponse
- Assert: Usage.TotalTokens > 0

**L1/ToolExecution**
- Call `engine.Execute(ctx, agentID, "请用计算器算一下 123 + 456")`
- Assert: ThinkingChain contains StepToolCall + StepToolResult
- Assert: final response includes "579"

**L1/MemoryUpdate**
- Call `memory.Store.GetMemories(ctx, agentID, 100)` after above executions
- Assert: memory count increased from seeded baseline
- Assert: new memories contain content from conversations

---

## L2: Team Collaboration

### Setup (builds on L1 state)
- Create a second agent (name: "Kai", role: "translator") using the same LLM provider
- Register a Team with both Nora (researcher) and Kai (translator) as members
- Register the team under the Steward
- Initialize Scheduler with Redis message bus

### Subtests

**L2/TaskDecomposition**
- Call `steward.Handle(ctx, teamID, "请研究一下Go语言的并发模型，然后翻译成英文摘要")`
- Assert: `StewardResult.Tasks` has 2 entries
- Assert: each task assigned to correct agent role (researcher + translator)
- Assert: `StewardResult.Intent.Action` is non-empty

**L2/ParallelDispatch**
- Same call, verify timing behavior
- Assert: `StewardResult.Duration` reasonable (both tasks completed)
- Assert: all tasks have `TaskDone` status

**L2/ResultAggregation**
- Verify the Steward's summary output
- Assert: `StewardResult.Summary` is non-empty
- Assert: summary contains content from both sub-task outputs

---

## L3: Gateway Integration

### Setup (builds on L2 state)
- Initialize `Gateway` with a `CaptureAdapter` (test implementation that records all `Send()` calls)
- Wire `MessageRouter` with engine, gateway, steward, pgStore from previous layers
- Call `gw.SetHandler(msgRouter.Handle)` BEFORE `gw.Register(captureAdapter)`

### CaptureAdapter

```go
type CaptureAdapter struct {
    sent    []*gateway.OutboundMessage
    handler gateway.MessageHandler
    mu      sync.Mutex
}
```

Implements `GatewayAdapter`, stores all `Send()` calls, forwards `OnMessage` to handler. Verifies full round-trip without real Slack.

### Subtests

**L3/AgentRouting**
- Inject `InboundMessage{Platform: "test", ChannelID: "ch1", Content: "@Nora 你今天心情怎么样？"}`
- Assert: capture adapter received exactly 1 `OutboundMessage`
- Assert: response content non-empty, platform/channel match inbound
- Assert: PostgreSQL has session record with user + assistant messages

**L3/TeamRouting**
- Inject `InboundMessage{Content: "@team-research 分析Go并发模型并翻译"}`
- Assert: capture adapter received 2+ messages (status + final result)
- Assert: final message contains aggregated team output

**L3/FallbackBehavior**
- With single agent: inject message without @mention → routes to default agent
- With multiple agents: inject message without @mention → reply contains "No agent matched"

**L3/SessionPersistence**
- After AgentRouting, query `pgStore.GetMessages(ctx, sessionID)`
- Assert: messages array has ≥2 entries (user + assistant)
- Assert: roles and content match the conversation

---

## Test Infrastructure

### Container Lifecycle (`TestMain`)

```
TestMain(m *testing.M)
├── Start Neo4j container (testcontainers-go)
│   └── Export NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD
├── Start PostgreSQL container
│   └── Run migrations, export PG_DSN
├── Start Redis container
│   └── Export REDIS_URL
├── Init real LLM provider from env vars
│   └── NUKA_TEST_PROVIDER_ENDPOINT, NUKA_TEST_PROVIDER_API_KEY, NUKA_TEST_PROVIDER_MODEL
├── Run m.Run()
└── Tear down all containers
```

If LLM env vars are missing, LLM-dependent subtests call `t.Skip("LLM provider not configured")`.

### Seed Data

A `seedTestData()` function populates Neo4j with known test data:
- 3-5 schemas per agent (e.g. "Go并发", "数据库设计", "API设计")
- 10+ memories linked to schemas via INSTANCE_OF relationships
- All test data uses unique agent ID prefix to avoid collision

Agent personas are created programmatically (not from config file).

### File Layout

```
tests/
└── e2e/
    ├── progressive_test.go   — TestMain + TestProgressiveFlow
    ├── testutil.go           — container helpers, seed data, CaptureAdapter
    └── testdata/
        └── seed_memories.json — pre-defined memory graph for seeding
```

### Dependencies to Add

```
go get github.com/testcontainers/testcontainers-go
go get github.com/testcontainers/testcontainers-go/modules/neo4j
go get github.com/testcontainers/testcontainers-go/modules/postgres
go get github.com/testcontainers/testcontainers-go/modules/redis
```
