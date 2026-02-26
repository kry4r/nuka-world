package e2e

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"strconv"
	"sync"
	"testing"

	"github.com/testcontainers/testcontainers-go"
	tcneo4j "github.com/testcontainers/testcontainers-go/modules/neo4j"
	tcpg "github.com/testcontainers/testcontainers-go/modules/postgres"
	tcredis "github.com/testcontainers/testcontainers-go/modules/redis"
	"go.uber.org/zap"

	"github.com/nidhogg/nuka-world/internal/agent"
	"github.com/nidhogg/nuka-world/internal/gateway"
	"github.com/nidhogg/nuka-world/internal/memory"
	"github.com/nidhogg/nuka-world/internal/orchestrator"
	"github.com/nidhogg/nuka-world/internal/provider"
	"github.com/nidhogg/nuka-world/internal/router"
	pgstore "github.com/nidhogg/nuka-world/internal/store"
)

// Suppress unused import warning for testcontainers base package.
var _ = testcontainers.GenericContainerRequest{}

// Package-level shared state — set by TestMain, used by all subtests.
var (
	testLogger   *zap.Logger
	testMemStore *memory.Store
	testPGStore  *pgstore.Store
	testRedisURL string
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
		tcpg.BasicWaitStrategies(),
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

type seedData struct {
	Schemas  []seedSchema        `json:"schemas"`
	Memories map[string][]string `json:"memories"`
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

// setupL1Agent creates the test agent "Nora" with LLM provider binding.
// Returns agentID, the configured engine, and the provider router.
func setupL1Agent(t *testing.T) (string, *agent.Engine, *provider.Router) {
	t.Helper()

	provRouter := provider.NewRouter(testLogger)

	// Register real LLM provider if configured
	if testLLMConfig != nil {
		p := provider.NewOpenAIProvider(provider.ProviderConfig{
			ID:       "test-llm",
			Type:     "openai",
			Name:     "Test LLM",
			Endpoint: testLLMConfig.Endpoint,
			APIKey:   testLLMConfig.APIKey,
			Models:   []string{testLLMConfig.Model},
		}, testLogger)
		provRouter.Register(p)
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
		Model:      testLLMModel(),
	}
	engine.Register(nora)

	// Bind agent to provider
	if testLLMConfig != nil {
		provRouter.Bind(nora.Persona.ID, "test-llm")
	}

	// Save agent to PG so session FK constraints work in L3 tests
	if testPGStore != nil {
		_ = testPGStore.SaveAgent(context.Background(), nora)
	}

	registerTestCalculator(engine)

	return nora.Persona.ID, engine, provRouter
}

// testLLMModel returns the configured model name or "default".
func testLLMModel() string {
	if testLLMConfig != nil {
		return testLLMConfig.Model
	}
	return "default"
}

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

// setupL2Team creates a second agent "Kai" (translator), builds a Team,
// initializes Steward + Scheduler with Redis MessageBus.
// Returns teamID, steward, and the engine (for L3 reuse).
func setupL2Team(t *testing.T, engine *agent.Engine, provRouter *provider.Router, noraID string) (string, *orchestrator.Steward) {
	t.Helper()

	kai := &agent.Agent{
		Persona: agent.Persona{
			Name:         "Kai",
			Role:         "translator",
			Personality:  "精通多语言的翻译专家",
			Backstory:    "专注于中英文技术文档翻译",
			SystemPrompt: "你是Kai，一位专业的中英文翻译。请将收到的内容翻译成英文。",
		},
		ProviderID: "test-llm",
		Model:      testLLMModel(),
	}
	engine.Register(kai)

	// Save Kai to PG for FK constraints
	if testPGStore != nil {
		_ = testPGStore.SaveAgent(context.Background(), kai)
	}

	// Bind Kai to provider
	if testLLMConfig != nil {
		provRouter.Bind(kai.Persona.ID, "test-llm")
	}

	bus, err := orchestrator.NewMessageBus(testRedisURL, testLogger)
	if err != nil {
		t.Fatalf("create message bus: %v", err)
	}
	t.Cleanup(func() { bus.Close() })

	scheduler := orchestrator.NewScheduler(engine, bus, 5, testLogger)
	steward := orchestrator.NewSteward(noraID, engine, scheduler, testLogger)

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

// CaptureAdapter is a test gateway adapter that records all outbound messages.
type CaptureAdapter struct {
	sent    []*gateway.OutboundMessage
	handler gateway.MessageHandler
	mu      sync.Mutex
}

func (c *CaptureAdapter) Platform() string                                  { return "test" }
func (c *CaptureAdapter) Connect(ctx context.Context) error                 { return nil }
func (c *CaptureAdapter) OnMessage(h gateway.MessageHandler)                { c.handler = h }
func (c *CaptureAdapter) Close() error                                      { return nil }
func (c *CaptureAdapter) Status() gateway.AdapterStatus {
	return gateway.AdapterStatus{Platform: "test", Connected: true}
}

func (c *CaptureAdapter) Send(ctx context.Context, msg *gateway.OutboundMessage) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.sent = append(c.sent, msg)
	return nil
}

func (c *CaptureAdapter) Broadcast(ctx context.Context, msg *gateway.BroadcastMessage) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.sent = append(c.sent, &gateway.OutboundMessage{
		Platform:  "test",
		ChannelID: "broadcast",
		Content:   msg.Content,
	})
	return nil
}

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

// setupL3Gateway creates a Gateway with CaptureAdapter and MessageRouter.
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
