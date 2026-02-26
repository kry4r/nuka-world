# Progressive E2E Testing Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a bottom-up progressive test suite validating the full agent dialogue flow — from single-agent cognitive loop to multi-agent team collaboration to gateway-level message routing.

**Architecture:** Single `TestProgressiveFlow` with nested subtests sharing container state. `TestMain` starts Neo4j/PG/Redis via testcontainers-go. L1→L2→L3 layers share state progressively.

**Tech Stack:** Go testing, testcontainers-go (Neo4j, PostgreSQL, Redis), real LLM API calls, no build tag isolation.

---

### Task 1: Add testcontainers-go Dependencies

**Files:**
- Modify: `go.mod`

**Step 1: Install testcontainers-go and modules**

Run:
```bash
cd /Users/nidhogg/Desktop/Nuka
go get github.com/testcontainers/testcontainers-go
go get github.com/testcontainers/testcontainers-go/modules/neo4j
go get github.com/testcontainers/testcontainers-go/modules/postgres
go get github.com/testcontainers/testcontainers-go/modules/redis
```

**Step 2: Tidy modules**

Run: `go mod tidy`
Expected: Clean exit, no errors.

**Step 3: Verify imports resolve**

Run: `go build ./...`
Expected: PASS — all packages compile.

**Step 4: Commit**

```bash
git add go.mod go.sum
git commit -m "deps: add testcontainers-go for E2E testing"
```

---

### Task 2: Test Infrastructure — TestMain + Container Helpers

**Files:**
- Create: `tests/e2e/testutil.go`

**Step 1: Create `tests/e2e/` directory and `testutil.go` with package-level vars and container helpers**

```go
package e2e

import (
	"context"
	"fmt"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/neo4j/neo4j-go-driver/v5/neo4j"
	"github.com/testcontainers/testcontainers-go"
	tcneo4j "github.com/testcontainers/testcontainers-go/modules/neo4j"
	tcpg "github.com/testcontainers/testcontainers-go/modules/postgres"
	tcredis "github.com/testcontainers/testcontainers-go/modules/redis"
	"go.uber.org/zap"

	"github.com/nidhogg/nuka-world/internal/agent"
	"github.com/nidhogg/nuka-world/internal/memory"
	"github.com/nidhogg/nuka-world/internal/provider"
	pgstore "github.com/nidhogg/nuka-world/internal/store"
)

// Package-level shared state — set by TestMain, used by all subtests.
var (
	testLogger    *zap.Logger
	testMemStore  *memory.Store
	testPGStore   *pgstore.Store
	testRedisURL  string
	testLLMConfig *llmTestConfig
)

type llmTestConfig struct {
	Endpoint string
	APIKey   string
	Model    string
}

// startNeo4j starts a Neo4j testcontainer, returns URI + cleanup func.
func startNeo4j(ctx context.Context) (string, func(), error) {
	container, err := tcneo4j.Run(ctx, "neo4j:5-community",
		tcneo4j.WithoutAuthentication(),
	)
	if err != nil {
		return "", nil, fmt.Errorf("start neo4j: %w", err)
	}
	uri, err := container.BoltUrl(ctx)
	if err != nil {
		container.Terminate(ctx)
		return "", nil, fmt.Errorf("neo4j bolt url: %w", err)
	}
	cleanup := func() { container.Terminate(ctx) }
	return uri, cleanup, nil
}

// startPostgres starts a PostgreSQL testcontainer, returns DSN + cleanup func.
func startPostgres(ctx context.Context) (string, func(), error) {
	container, err := tcpg.Run(ctx, "postgres:16-alpine",
		tcpg.WithDatabase("nuka_test"),
		tcpg.WithUsername("test"),
		tcpg.WithPassword("test"),
	)
	if err != nil {
		return "", nil, fmt.Errorf("start postgres: %w", err)
	}
	dsn, err := container.ConnectionString(ctx, "sslmode=disable")
	if err != nil {
		container.Terminate(ctx)
		return "", nil, fmt.Errorf("pg connection string: %w", err)
	}
	cleanup := func() { container.Terminate(ctx) }
	return dsn, cleanup, nil
}

// startRedis starts a Redis testcontainer, returns URL + cleanup func.
func startRedis(ctx context.Context) (string, func(), error) {
	container, err := tcredis.Run(ctx, "redis:7-alpine")
	if err != nil {
		return "", nil, fmt.Errorf("start redis: %w", err)
	}
	endpoint, err := container.Endpoint(ctx, "")
	if err != nil {
		container.Terminate(ctx)
		return "", nil, fmt.Errorf("redis endpoint: %w", err)
	}
	url := "redis://" + endpoint
	cleanup := func() { container.Terminate(ctx) }
	return url, cleanup, nil
}

// skipIfNoLLM skips the test if LLM env vars are not configured.
func skipIfNoLLM(t *testing.T) {
	t.Helper()
	if testLLMConfig == nil {
		t.Skip("LLM provider not configured (set NUKA_TEST_PROVIDER_ENDPOINT, NUKA_TEST_PROVIDER_API_KEY, NUKA_TEST_PROVIDER_MODEL)")
	}
}
```

**Step 2: Verify it compiles**

Run: `go build ./tests/e2e/...`
Expected: May fail because `progressive_test.go` doesn't exist yet — that's OK. Verify no syntax errors in `testutil.go` by checking `go vet ./tests/e2e/...`.

**Step 3: Commit**

```bash
git add tests/e2e/testutil.go
git commit -m "test: add E2E container helpers and shared state"
```

---

### Task 3: TestMain + Progressive Test Skeleton

**Files:**
- Create: `tests/e2e/progressive_test.go`

**Step 1: Create `progressive_test.go` with TestMain**

```go
package e2e

import (
	"context"
	"fmt"
	"os"
	"testing"

	"github.com/nidhogg/nuka-world/internal/memory"
	pgstore "github.com/nidhogg/nuka-world/internal/store"
	"go.uber.org/zap"
)

func TestMain(m *testing.M) {
	ctx := context.Background()
	testLogger, _ = zap.NewDevelopment()

	// 1. Start Neo4j
	neo4jURI, neo4jCleanup, err := startNeo4j(ctx)
	if err != nil {
		fmt.Fprintf(os.Stderr, "neo4j: %v\n", err)
		os.Exit(1)
	}
	defer neo4jCleanup()

	testMemStore, err = memory.NewStore(neo4jURI, "", "", testLogger)
	if err != nil {
		fmt.Fprintf(os.Stderr, "memory store: %v\n", err)
		os.Exit(1)
	}
	defer testMemStore.Close(ctx)

	// 2. Start PostgreSQL
	pgDSN, pgCleanup, err := startPostgres(ctx)
	if err != nil {
		fmt.Fprintf(os.Stderr, "postgres: %v\n", err)
		os.Exit(1)
	}
	defer pgCleanup()

	testPGStore, err = pgstore.New(pgDSN, testLogger)
	if err != nil {
		fmt.Fprintf(os.Stderr, "pg store: %v\n", err)
		os.Exit(1)
	}
	defer testPGStore.Close()

	// Run migrations
	if err := testPGStore.Migrate(ctx, "../../migrations"); err != nil {
		fmt.Fprintf(os.Stderr, "migrate: %v\n", err)
		os.Exit(1)
	}

	// 3. Start Redis
	redisURL, redisCleanup, err := startRedis(ctx)
	if err != nil {
		fmt.Fprintf(os.Stderr, "redis: %v\n", err)
		os.Exit(1)
	}
	defer redisCleanup()
	testRedisURL = redisURL

	// 4. Check LLM env vars
	endpoint := os.Getenv("NUKA_TEST_PROVIDER_ENDPOINT")
	apiKey := os.Getenv("NUKA_TEST_PROVIDER_API_KEY")
	model := os.Getenv("NUKA_TEST_PROVIDER_MODEL")
	if endpoint != "" && apiKey != "" && model != "" {
		testLLMConfig = &llmTestConfig{
			Endpoint: endpoint,
			APIKey:   apiKey,
			Model:    model,
		}
	}

	os.Exit(m.Run())
}
```

**Step 2: Add empty `TestProgressiveFlow` skeleton**

Append to the same file:

```go
func TestProgressiveFlow(t *testing.T) {
	t.Run("L1_SingleAgent", func(t *testing.T) {
		t.Run("MemoryActivation", testL1MemoryActivation)
		t.Run("SchemaMatching", testL1SchemaMatching)
		t.Run("ContextBuilding", testL1ContextBuilding)
		t.Run("CognitiveLoop", testL1CognitiveLoop)
		t.Run("ToolExecution", testL1ToolExecution)
		t.Run("MemoryUpdate", testL1MemoryUpdate)
	})

	t.Run("L2_TeamCollaboration", func(t *testing.T) {
		t.Run("TaskDecomposition", testL2TaskDecomposition)
		t.Run("ParallelDispatch", testL2ParallelDispatch)
		t.Run("ResultAggregation", testL2ResultAggregation)
	})

	t.Run("L3_GatewayIntegration", func(t *testing.T) {
		t.Run("AgentRouting", testL3AgentRouting)
		t.Run("TeamRouting", testL3TeamRouting)
		t.Run("FallbackBehavior", testL3FallbackBehavior)
		t.Run("SessionPersistence", testL3SessionPersistence)
	})
}

// Stub functions — will be implemented in subsequent tasks.
func testL1MemoryActivation(t *testing.T)  { t.Skip("not implemented") }
func testL1SchemaMatching(t *testing.T)    { t.Skip("not implemented") }
func testL1ContextBuilding(t *testing.T)   { t.Skip("not implemented") }
func testL1CognitiveLoop(t *testing.T)     { t.Skip("not implemented") }
func testL1ToolExecution(t *testing.T)     { t.Skip("not implemented") }
func testL1MemoryUpdate(t *testing.T)      { t.Skip("not implemented") }
func testL2TaskDecomposition(t *testing.T) { t.Skip("not implemented") }
func testL2ParallelDispatch(t *testing.T)  { t.Skip("not implemented") }
func testL2ResultAggregation(t *testing.T) { t.Skip("not implemented") }
func testL3AgentRouting(t *testing.T)      { t.Skip("not implemented") }
func testL3TeamRouting(t *testing.T)       { t.Skip("not implemented") }
func testL3FallbackBehavior(t *testing.T)  { t.Skip("not implemented") }
func testL3SessionPersistence(t *testing.T){ t.Skip("not implemented") }
```

**Step 3: Verify test skeleton runs**

Run: `go test ./tests/e2e/ -v -count=1 -timeout 120s`
Expected: All 13 subtests SKIP with "not implemented". TestMain starts and tears down containers successfully.

**Step 4: Commit**

```bash
git add tests/e2e/progressive_test.go
git commit -m "test: add TestMain + progressive test skeleton with stubs"
```

---

### Task 4: Seed Data + L1 Setup Helpers

**Files:**
- Create: `tests/e2e/testdata/seed_memories.json`
- Modify: `tests/e2e/testutil.go` — add `seedTestData()` and `setupL1Agent()`

**Step 1: Create seed data JSON**

Create `tests/e2e/testdata/seed_memories.json`:

```json
{
  "schemas": [
    {
      "name": "Go并发",
      "description": "Go语言并发编程模型，包括goroutine、channel、sync包",
      "strength": 0.9
    },
    {
      "name": "数据库设计",
      "description": "关系型数据库设计原则，包括范式、索引、事务",
      "strength": 0.8
    },
    {
      "name": "API设计",
      "description": "RESTful API设计最佳实践，包括路由、认证、版本控制",
      "strength": 0.7
    }
  ],
  "memories": {
    "Go并发": [
      "goroutine是Go语言的轻量级线程，由Go运行时管理",
      "channel用于goroutine之间的通信和同步",
      "sync.WaitGroup用于等待一组goroutine完成",
      "select语句用于在多个channel操作中选择",
      "context包用于控制goroutine的生命周期"
    ],
    "数据库设计": [
      "第三范式要求消除传递依赖",
      "B+树索引适合范围查询",
      "事务的ACID特性保证数据一致性",
      "连接池可以减少数据库连接开销"
    ],
    "API设计": [
      "RESTful API使用HTTP方法表示操作语义",
      "JWT token用于无状态认证",
      "API版本控制可以通过URL路径或Header实现"
    ]
  }
}
```

**Step 2: Add `seedTestData()` to `testutil.go`**

Append to `tests/e2e/testutil.go`:

```go
import (
	"encoding/json"
	"os"
)

type seedData struct {
	Schemas  []seedSchema            `json:"schemas"`
	Memories map[string][]string     `json:"memories"`
}

type seedSchema struct {
	Name        string  `json:"name"`
	Description string  `json:"description"`
	Strength    float64 `json:"strength"`
}

// seedTestData populates Neo4j with test schemas and memories.
// Returns the number of memories seeded.
func seedTestData(ctx context.Context, store *memory.Store, agentID string) (int, error) {
	data, err := os.ReadFile("testdata/seed_memories.json")
	if err != nil {
		return 0, fmt.Errorf("read seed file: %w", err)
	}
	var sd seedData
	if err := json.Unmarshal(data, &sd); err != nil {
		return 0, fmt.Errorf("parse seed data: %w", err)
	}

	schemaMap := make(map[string]string) // name → id
	for _, s := range sd.Schemas {
		schema := &memory.Schema{
			AgentID:     agentID,
			Name:        s.Name,
			Description: s.Description,
			Strength:    s.Strength,
		}
		if err := store.CreateSchema(ctx, schema); err != nil {
			return 0, fmt.Errorf("create schema %s: %w", s.Name, err)
		}
		schemaMap[s.Name] = schema.ID
	}

	memCount := 0
	for schemaName, contents := range sd.Memories {
		schemaID, ok := schemaMap[schemaName]
		if !ok {
			continue
		}
		for _, content := range contents {
			mem := &memory.Memory{
				AgentID:    agentID,
				Content:    content,
				Importance: 0.7,
			}
			if err := store.CreateMemory(ctx, mem); err != nil {
				return 0, fmt.Errorf("create memory: %w", err)
			}
			if err := store.LinkMemoryToSchema(ctx, mem.ID, schemaID); err != nil {
				return 0, fmt.Errorf("link memory: %w", err)
			}
			memCount++
		}
	}
	return memCount, nil
}
```

**Step 3: Add `setupL1Agent()` to `testutil.go`**

Append to `tests/e2e/testutil.go`:

```go
// setupL1Agent creates the test agent "Nora" with LLM provider binding.
// Returns agentID and the configured engine.
func setupL1Agent(t *testing.T) (string, *agent.Engine) {
	t.Helper()

	provRouter := provider.NewRouter(testLogger)

	// Register real LLM provider if configured
	if testLLMConfig != nil {
		p := provider.NewOpenAICompatible(
			"test-llm",
			testLLMConfig.Endpoint,
			testLLMConfig.APIKey,
			testLLMConfig.Model,
			testLogger,
		)
		provRouter.RegisterProvider("test-llm", p)
		provRouter.SetDefault("test-llm")
	}

	engine := agent.NewEngine(provRouter, testMemStore, testLogger)

	nora := &agent.Agent{
		Persona: agent.Persona{
			Name:         "Nora",
			Role:         "researcher",
			Personality:  "好奇心强的研究员",
			Backstory:    "专注于技术研究和知识整理",
			SystemPrompt: "你是Nora，一位专注于技术研究的AI助手。请用中文回答。",
		},
		ProviderID: "test-llm",
		Model:      "default",
	}
	engine.Register(nora)

	// Bind agent to provider
	if testLLMConfig != nil {
		provRouter.BindAgent(nora.Persona.ID, "test-llm")
	}

	return nora.Persona.ID, engine
}
```

**Step 4: Verify compilation**

Run: `go vet ./tests/e2e/...`
Expected: No errors.

**Step 5: Commit**

```bash
git add tests/e2e/testdata/seed_memories.json tests/e2e/testutil.go
git commit -m "test: add seed data and L1 agent setup helpers"
```

---

### Task 5: L1 Memory Subtests — Activation, SchemaMatching, ContextBuilding

**Files:**
- Modify: `tests/e2e/progressive_test.go` — replace stubs with real tests

**Step 1: Add shared L1 state and setup at top of `TestProgressiveFlow`**

Replace the `L1_SingleAgent` block in `TestProgressiveFlow`:

```go
func TestProgressiveFlow(t *testing.T) {
	ctx := context.Background()

	// L1 shared state
	agentID, engine := setupL1Agent(t)
	seedCount, err := seedTestData(ctx, testMemStore, agentID)
	if err != nil {
		t.Fatalf("seed data: %v", err)
	}
	t.Logf("Seeded %d memories for agent %s", seedCount, agentID)

	t.Run("L1_SingleAgent", func(t *testing.T) {
		// ... subtests below
	})
	// L2, L3 follow
}
```

**Step 2: Implement `MemoryActivation` subtest**

Inside `L1_SingleAgent`:

```go
t.Run("MemoryActivation", func(t *testing.T) {
	result, err := testMemStore.Activate(ctx, agentID,
		[]string{"Go", "并发", "goroutine"},
		memory.DefaultActivationOpts(),
	)
	if err != nil {
		t.Fatalf("Activate: %v", err)
	}
	if len(result.Nodes) == 0 {
		t.Fatal("expected recalled nodes, got 0")
	}
	// Verify descending activation order
	for i := 1; i < len(result.Nodes); i++ {
		if result.Nodes[i].Activation > result.Nodes[i-1].Activation {
			t.Errorf("nodes not sorted: [%d]=%f > [%d]=%f",
				i, result.Nodes[i].Activation,
				i-1, result.Nodes[i-1].Activation)
		}
	}
	// Verify threshold filtering
	for _, n := range result.Nodes {
		if n.Activation < 0.3 {
			t.Errorf("node %s below threshold: %f", n.ID, n.Activation)
		}
	}
	t.Logf("Recalled %d nodes in %v", len(result.Nodes), result.Duration)
})
```

**Step 3: Implement `SchemaMatching` subtest**

```go
t.Run("SchemaMatching", func(t *testing.T) {
	matches, err := testMemStore.MatchSchemas(ctx, agentID, []string{"Go", "并发"})
	if err != nil {
		t.Fatalf("MatchSchemas: %v", err)
	}
	if len(matches) == 0 {
		t.Fatal("expected schema matches, got 0")
	}
	// Top match should be "Go并发"
	if matches[0].Schema.Name != "Go并发" {
		t.Errorf("top match = %q, want %q", matches[0].Schema.Name, "Go并发")
	}
	if matches[0].Score <= 0.5 {
		t.Errorf("top score = %f, want > 0.5", matches[0].Score)
	}
	// Verify descending score order
	for i := 1; i < len(matches); i++ {
		if matches[i].Score > matches[i-1].Score {
			t.Errorf("matches not sorted: [%d]=%f > [%d]=%f",
				i, matches[i].Score, i-1, matches[i-1].Score)
		}
	}
	t.Logf("Matched %d schemas, top: %s (%.2f)",
		len(matches), matches[0].Schema.Name, matches[0].Score)
})
```

**Step 4: Implement `ContextBuilding` subtest**

```go
t.Run("ContextBuilding", func(t *testing.T) {
	budget := memory.ContextBudget{MaxTokens: 2000, MaxBlocks: 10}
	blocks, err := testMemStore.BuildContext(ctx, agentID,
		[]string{"Go", "并发"}, budget)
	if err != nil {
		t.Fatalf("BuildContext: %v", err)
	}
	if len(blocks) == 0 {
		t.Fatal("expected context blocks, got 0")
	}
	// Verify token budget
	totalTokens := 0
	for _, b := range blocks {
		totalTokens += b.TokenEstimate
	}
	if totalTokens > budget.MaxTokens {
		t.Errorf("total tokens %d exceeds budget %d", totalTokens, budget.MaxTokens)
	}
	// Verify FormatContextPrompt
	prompt := memory.FormatContextPrompt(blocks)
	if !strings.HasPrefix(prompt, "[Memory Context]") {
		t.Errorf("prompt should start with [Memory Context], got: %s", prompt[:50])
	}
	t.Logf("Built %d blocks, %d tokens", len(blocks), totalTokens)
})
```

**Step 5: Remove the old stub functions for these 3 tests**

Delete `testL1MemoryActivation`, `testL1SchemaMatching`, `testL1ContextBuilding` stubs.

**Step 6: Verify tests pass**

Run: `go test ./tests/e2e/ -v -run TestProgressiveFlow/L1_SingleAgent/MemoryActivation -count=1 -timeout 120s`
Expected: PASS — Neo4j container starts, seed data loaded, activation returns nodes.

Run: `go test ./tests/e2e/ -v -run "TestProgressiveFlow/L1_SingleAgent/(MemoryActivation|SchemaMatching|ContextBuilding)" -count=1 -timeout 120s`
Expected: All 3 PASS.

**Step 7: Commit**

```bash
git add tests/e2e/progressive_test.go
git commit -m "test(L1): implement memory activation, schema matching, context building"
```

---

### Task 6: L1 LLM Subtests — CognitiveLoop, ToolExecution, MemoryUpdate

**Files:**
- Modify: `tests/e2e/progressive_test.go`
- Modify: `tests/e2e/testutil.go` — add `registerTestCalculator()`

**Step 1: Add `registerTestCalculator()` to `testutil.go`**

```go
import "strconv"

// registerTestCalculator adds a deterministic calculator tool to the engine.
func registerTestCalculator(engine *agent.Engine) {
	engine.Tools().Register(provider.Tool{
		Type: "function",
		Function: provider.ToolFunction{
			Name:        "test_calculator",
			Description: "计算两个数的加法。参数: a (number), b (number)",
			Parameters: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"a": map[string]interface{}{"type": "number", "description": "第一个数"},
					"b": map[string]interface{}{"type": "number", "description": "第二个数"},
				},
				"required": []string{"a", "b"},
			},
		},
	}, func(ctx context.Context, args string) (string, error) {
		var params struct {
			A float64 `json:"a"`
			B float64 `json:"b"`
		}
		if err := json.Unmarshal([]byte(args), &params); err != nil {
			return "", err
		}
		result := params.A + params.B
		return fmt.Sprintf(`{"result": %s}`, strconv.FormatFloat(result, 'f', -1, 64)), nil
	})
}
```

**Step 2: Call `registerTestCalculator` in `setupL1Agent`**

Add before `return` in `setupL1Agent`:
```go
registerTestCalculator(engine)
```

**Step 3: Implement `CognitiveLoop` subtest**

Replace the stub in `progressive_test.go`:

```go
t.Run("CognitiveLoop", func(t *testing.T) {
	skipIfNoLLM(t)

	result, err := engine.Execute(ctx, agentID, "你好，介绍一下你自己")
	if err != nil {
		t.Fatalf("Execute: %v", err)
	}
	if result.Content == "" {
		t.Fatal("expected non-empty response")
	}
	// Verify thinking chain steps
	hasRecall := false
	hasReasoning := false
	hasResponse := false
	for _, step := range result.Chain.Steps {
		switch step.Type {
		case agent.StepMemoryRecall:
			hasRecall = true
		case agent.StepReasoning:
			hasReasoning = true
		case agent.StepResponse:
			hasResponse = true
		}
	}
	if !hasRecall {
		t.Error("missing StepMemoryRecall in chain")
	}
	if !hasReasoning {
		t.Error("missing StepReasoning in chain")
	}
	if !hasResponse {
		t.Error("missing StepResponse in chain")
	}
	if result.Usage.TotalTokens == 0 {
		t.Error("expected TotalTokens > 0")
	}
	t.Logf("Response: %.100s... (tokens: %d)", result.Content, result.Usage.TotalTokens)
})
```

**Step 4: Implement `ToolExecution` subtest**

```go
t.Run("ToolExecution", func(t *testing.T) {
	skipIfNoLLM(t)

	result, err := engine.Execute(ctx, agentID, "请用计算器算一下 123 + 456")
	if err != nil {
		t.Fatalf("Execute: %v", err)
	}
	// Verify tool call chain
	hasToolCall := false
	hasToolResult := false
	for _, step := range result.Chain.Steps {
		switch step.Type {
		case agent.StepToolCall:
			hasToolCall = true
		case agent.StepToolResult:
			hasToolResult = true
		}
	}
	if !hasToolCall {
		t.Error("missing StepToolCall in chain")
	}
	if !hasToolResult {
		t.Error("missing StepToolResult in chain")
	}
	if !strings.Contains(result.Content, "579") {
		t.Errorf("response should contain 579, got: %s", result.Content)
	}
	t.Logf("Tool response: %.100s...", result.Content)
})
```

**Step 5: Implement `MemoryUpdate` subtest**

```go
// Track baseline before LLM tests
var baselineMemCount int

// (Set baselineMemCount right after seedTestData in TestProgressiveFlow setup):
// baselineMems, _ := testMemStore.GetMemories(ctx, agentID, 100)
// baselineMemCount = len(baselineMems)

t.Run("MemoryUpdate", func(t *testing.T) {
	skipIfNoLLM(t)

	mems, err := testMemStore.GetMemories(ctx, agentID, 100)
	if err != nil {
		t.Fatalf("GetMemories: %v", err)
	}
	if len(mems) <= baselineMemCount {
		t.Errorf("memory count %d not greater than baseline %d",
			len(mems), baselineMemCount)
	}
	t.Logf("Memories: baseline=%d, current=%d (+%d)",
		baselineMemCount, len(mems), len(mems)-baselineMemCount)
})
```

**Step 6: Remove old stubs for these 3 tests**

Delete `testL1CognitiveLoop`, `testL1ToolExecution`, `testL1MemoryUpdate` stubs.

**Step 7: Verify**

Run: `go test ./tests/e2e/ -v -run "TestProgressiveFlow/L1_SingleAgent" -count=1 -timeout 300s`
Expected: Memory subtests PASS. LLM subtests PASS if env vars set, SKIP otherwise.

**Step 8: Commit**

```bash
git add tests/e2e/progressive_test.go tests/e2e/testutil.go
git commit -m "test(L1): implement cognitive loop, tool execution, memory update"
```

---

### Task 7: L2 Team Collaboration — Setup + Subtests

**Files:**
- Modify: `tests/e2e/testutil.go` — add `setupL2Team()`
- Modify: `tests/e2e/progressive_test.go` — replace L2 stubs with real tests

**Step 1: Add `setupL2Team()` to `testutil.go`**

```go
// setupL2Team creates a second agent "Kai" (translator), builds a Team,
// initializes Steward + Scheduler with Redis MessageBus.
// Returns teamID, steward, and the second agent's ID.
func setupL2Team(t *testing.T, engine *agent.Engine, noraID string) (string, *orchestrator.Steward) {
	t.Helper()

	// Register second agent: Kai the translator
	kai := &agent.Agent{
		Persona: agent.Persona{
			Name:         "Kai",
			Role:         "translator",
			Personality:  "精通多语言的翻译专家",
			Backstory:    "专注于中英文技术文档翻译",
			SystemPrompt: "你是Kai，一位专业的中英文翻译。请将收到的内容翻译成英文。",
		},
		ProviderID: "test-llm",
		Model:      "default",
	}
	engine.Register(kai)

	// Create Redis message bus
	bus, err := orchestrator.NewMessageBus(testRedisURL, testLogger)
	if err != nil {
		t.Fatalf("create message bus: %v", err)
	}
	t.Cleanup(func() { bus.Close() })

	// Create scheduler
	scheduler := orchestrator.NewScheduler(engine, bus, 5, testLogger)

	// Create steward (uses Nora's agent ID as the steward agent)
	steward := orchestrator.NewSteward(noraID, engine, scheduler, testLogger)

	// Register team
	team := &orchestrator.Team{
		Name: "research",
		Members: []orchestrator.Member{
			{AgentID: noraID, Role: "researcher", CanDelegate: true, Priority: 1},
			{AgentID: kai.Persona.ID, Role: "translator", CanDelegate: false, Priority: 1},
		},
		Workflow: orchestrator.Workflow{
			Type: orchestrator.WorkflowParallel,
		},
	}
	steward.RegisterTeam(team)

	return team.ID, steward
}
```

**Step 2: Wire L2 setup into `TestProgressiveFlow`**

In `progressive_test.go`, after the L1 block, add shared L2 state:

```go
// L2 shared state
skipIfNoLLM(t) // L2 requires LLM for steward decomposition
teamID, steward := setupL2Team(t, engine, agentID)

var stewardResult *orchestrator.StewardResult
```

**Step 3: Implement `TaskDecomposition` subtest**

Replace the stub in `progressive_test.go`:

```go
t.Run("TaskDecomposition", func(t *testing.T) {
	var err error
	stewardResult, err = steward.Handle(ctx, teamID,
		"请研究一下Go语言的并发模型，然后翻译成英文摘要")
	if err != nil {
		t.Fatalf("Steward.Handle: %v", err)
	}
	if stewardResult.Intent == nil {
		t.Fatal("expected non-nil Intent")
	}
	if stewardResult.Intent.Action == "" {
		t.Error("expected non-empty Intent.Action")
	}
	if len(stewardResult.Tasks) < 2 {
		t.Errorf("expected ≥2 tasks, got %d", len(stewardResult.Tasks))
	}
	// Verify roles assigned
	roles := make(map[string]bool)
	for _, tr := range stewardResult.Tasks {
		roles[tr.AgentID] = true
	}
	t.Logf("Intent: %s, Tasks: %d, Roles: %v",
		stewardResult.Intent.Action, len(stewardResult.Tasks), roles)
})
```

**Step 4: Implement `ParallelDispatch` subtest**

```go
t.Run("ParallelDispatch", func(t *testing.T) {
	if stewardResult == nil {
		t.Skip("depends on TaskDecomposition")
	}
	// Verify all tasks completed
	for _, tr := range stewardResult.Tasks {
		if tr.Status != orchestrator.TaskDone {
			t.Errorf("task %s status = %s, want done", tr.TaskID, tr.Status)
		}
	}
	// Verify reasonable duration (both tasks ran)
	if stewardResult.Duration == 0 {
		t.Error("expected non-zero Duration")
	}
	t.Logf("Dispatch completed in %v, %d tasks",
		stewardResult.Duration, len(stewardResult.Tasks))
})
```

**Step 5: Implement `ResultAggregation` subtest**

```go
t.Run("ResultAggregation", func(t *testing.T) {
	if stewardResult == nil {
		t.Skip("depends on TaskDecomposition")
	}
	if stewardResult.Summary == "" {
		t.Fatal("expected non-empty Summary")
	}
	// Summary should contain content from sub-task outputs
	hasContent := false
	for _, tr := range stewardResult.Tasks {
		if tr.Output != "" {
			hasContent = true
		}
	}
	if !hasContent {
		t.Error("no task produced output")
	}
	t.Logf("Summary: %.200s...", stewardResult.Summary)
})
```

**Step 6: Remove old L2 stubs**

Delete `testL2TaskDecomposition`, `testL2ParallelDispatch`, `testL2ResultAggregation` stubs.

**Step 7: Verify**

Run: `go test ./tests/e2e/ -v -run "TestProgressiveFlow/L2_TeamCollaboration" -count=1 -timeout 300s`
Expected: All 3 PASS (requires LLM env vars).

**Step 8: Commit**

```bash
git add tests/e2e/progressive_test.go tests/e2e/testutil.go
git commit -m "test(L2): implement team collaboration subtests"
```

---

### Task 8: L3 Gateway Integration — CaptureAdapter + Subtests

**Files:**
- Modify: `tests/e2e/testutil.go` — add `CaptureAdapter` and `setupL3Gateway()`
- Modify: `tests/e2e/progressive_test.go` — replace L3 stubs with real tests

**Step 1: Add `CaptureAdapter` to `testutil.go`**

```go
import "sync"

// CaptureAdapter is a test gateway adapter that records all outbound messages.
type CaptureAdapter struct {
	sent    []*gateway.OutboundMessage
	handler gateway.MessageHandler
	mu      sync.Mutex
}

func (c *CaptureAdapter) Platform() string { return "test" }

func (c *CaptureAdapter) Connect(ctx context.Context) error { return nil }

func (c *CaptureAdapter) Send(ctx context.Context, msg *gateway.OutboundMessage) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.sent = append(c.sent, msg)
	return nil
}

func (c *CaptureAdapter) OnMessage(h gateway.MessageHandler) {
	c.handler = h
}

func (c *CaptureAdapter) Broadcast(ctx context.Context, msg *gateway.OutboundMessage) error {
	return c.Send(ctx, msg)
}

func (c *CaptureAdapter) Close() error { return nil }

// Inject simulates an inbound message from a user.
func (c *CaptureAdapter) Inject(msg *gateway.InboundMessage) {
	msg.Platform = "test"
	if c.handler != nil {
		c.handler(msg)
	}
}

// Sent returns a copy of all captured outbound messages.
func (c *CaptureAdapter) Sent() []*gateway.OutboundMessage {
	c.mu.Lock()
	defer c.mu.Unlock()
	cp := make([]*gateway.OutboundMessage, len(c.sent))
	copy(cp, c.sent)
	return cp
}

// Reset clears captured messages.
func (c *CaptureAdapter) Reset() {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.sent = nil
}
```

**Step 2: Add `setupL3Gateway()` to `testutil.go`**

```go
// setupL3Gateway creates a Gateway with CaptureAdapter and MessageRouter.
// IMPORTANT: SetHandler MUST be called BEFORE Register (handler captured at registration).
func setupL3Gateway(t *testing.T, engine *agent.Engine,
	steward *orchestrator.Steward) (*CaptureAdapter, *router.MessageRouter) {
	t.Helper()

	gw := gateway.NewGateway(testLogger)
	capture := &CaptureAdapter{}

	msgRouter := router.New(engine, gw, steward, testPGStore, testLogger)

	// SetHandler BEFORE Register — handler is captured at registration time
	gw.SetHandler(msgRouter.Handle)
	gw.Register(capture)

	return capture, msgRouter
}
```

**Step 3: Wire L3 setup into `TestProgressiveFlow`**

In `progressive_test.go`, after the L2 block, add shared L3 state:

```go
// L3 shared state
capture, _ := setupL3Gateway(t, engine, steward)
```

**Step 4: Implement `AgentRouting` subtest**

```go
t.Run("AgentRouting", func(t *testing.T) {
	skipIfNoLLM(t)
	capture.Reset()

	capture.Inject(&gateway.InboundMessage{
		ChannelID: "ch-test-1",
		UserID:    "user-1",
		UserName:  "tester",
		Content:   "@Nora 你今天心情怎么样？",
	})

	// Wait briefly for async processing
	time.Sleep(5 * time.Second)

	sent := capture.Sent()
	if len(sent) == 0 {
		t.Fatal("expected at least 1 outbound message")
	}
	last := sent[len(sent)-1]
	if last.Content == "" {
		t.Error("expected non-empty response content")
	}
	if last.Platform != "test" {
		t.Errorf("platform = %q, want test", last.Platform)
	}
	if last.ChannelID != "ch-test-1" {
		t.Errorf("channel = %q, want ch-test-1", last.ChannelID)
	}
	t.Logf("Agent reply: %.100s...", last.Content)
})
```

**Step 5: Implement `TeamRouting` subtest**

```go
t.Run("TeamRouting", func(t *testing.T) {
	skipIfNoLLM(t)
	capture.Reset()

	capture.Inject(&gateway.InboundMessage{
		ChannelID: "ch-test-2",
		UserID:    "user-1",
		UserName:  "tester",
		Content:   "@team-research 分析Go并发模型并翻译",
	})

	// Team routing takes longer — status msg + final result
	time.Sleep(30 * time.Second)

	sent := capture.Sent()
	if len(sent) < 2 {
		t.Errorf("expected ≥2 messages (status + result), got %d", len(sent))
	}
	// First message should be the "collaborating" status
	if len(sent) > 0 && !strings.Contains(sent[0].Content, "collaborating") {
		t.Logf("first message: %s", sent[0].Content)
	}
	// Last message should contain aggregated team output
	if len(sent) > 0 {
		last := sent[len(sent)-1]
		if last.Content == "" {
			t.Error("expected non-empty final message")
		}
		t.Logf("Team reply (%d msgs): %.200s...", len(sent), last.Content)
	}
})
```

**Step 6: Implement `FallbackBehavior` subtest**

```go
t.Run("FallbackBehavior", func(t *testing.T) {
	capture.Reset()

	// No @mention — with multiple agents registered, should get "No agent matched"
	capture.Inject(&gateway.InboundMessage{
		ChannelID: "ch-test-3",
		UserID:    "user-1",
		UserName:  "tester",
		Content:   "这是一条没有@提及的消息",
	})

	time.Sleep(2 * time.Second)

	sent := capture.Sent()
	if len(sent) == 0 {
		t.Fatal("expected a fallback reply")
	}
	reply := sent[0].Content
	if !strings.Contains(reply, "No agent matched") {
		t.Errorf("expected 'No agent matched' fallback, got: %s", reply)
	}
	t.Logf("Fallback reply: %s", reply)
})
```

**Step 7: Implement `SessionPersistence` subtest**

```go
t.Run("SessionPersistence", func(t *testing.T) {
	skipIfNoLLM(t)

	// After AgentRouting ran, PG should have a session with messages
	// Find the session for agent + channel used in AgentRouting
	sessionID, err := testPGStore.FindOrCreateSession(ctx,
		agentID, "ch-test-1", "test")
	if err != nil {
		t.Fatalf("FindOrCreateSession: %v", err)
	}
	if sessionID == "" {
		t.Fatal("expected non-empty session ID")
	}

	msgs, err := testPGStore.GetMessages(ctx, sessionID, 50)
	if err != nil {
		t.Fatalf("GetMessages: %v", err)
	}
	if len(msgs) < 2 {
		t.Errorf("expected ≥2 messages (user + assistant), got %d", len(msgs))
	}

	// Verify roles
	hasUser := false
	hasAssistant := false
	for _, m := range msgs {
		switch m.Role {
		case "user":
			hasUser = true
		case "assistant":
			hasAssistant = true
		}
	}
	if !hasUser {
		t.Error("missing user message in session")
	}
	if !hasAssistant {
		t.Error("missing assistant message in session")
	}
	t.Logf("Session %s: %d messages", sessionID, len(msgs))
})
```

**Step 8: Remove old L3 stubs**

Delete `testL3AgentRouting`, `testL3TeamRouting`, `testL3FallbackBehavior`, `testL3SessionPersistence` stubs.

**Step 9: Verify full suite**

Run: `go test ./tests/e2e/ -v -run "TestProgressiveFlow" -count=1 -timeout 600s`
Expected: L1 memory subtests PASS. L1/L2/L3 LLM subtests PASS if env vars set, SKIP otherwise.

**Step 10: Commit**

```bash
git add tests/e2e/progressive_test.go tests/e2e/testutil.go
git commit -m "test(L3): implement gateway integration subtests with CaptureAdapter"
```

---

### Task Summary

| Task | Layer | What |
|------|-------|------|
| 1 | Infra | Add testcontainers-go dependencies |
| 2 | Infra | Container helpers + shared state |
| 3 | Infra | TestMain + progressive test skeleton |
| 4 | L1 | Seed data + agent setup helpers |
| 5 | L1 | Memory subtests (Activation, Schema, Context) |
| 6 | L1 | LLM subtests (Cognitive, Tool, MemoryUpdate) |
| 7 | L2 | Team collaboration (Decompose, Dispatch, Aggregate) |
| 8 | L3 | Gateway integration (Agent/Team routing, Fallback, Session) |

---

### Running the Tests

**Without LLM (memory-only tests):**
```bash
go test ./tests/e2e/ -v -count=1 -timeout 120s
```

**With LLM (full progressive flow):**
```bash
NUKA_TEST_PROVIDER_ENDPOINT=http://localhost:11434/v1 \
NUKA_TEST_PROVIDER_API_KEY=ollama \
NUKA_TEST_PROVIDER_MODEL=qwen2.5:7b \
go test ./tests/e2e/ -v -count=1 -timeout 600s
```
