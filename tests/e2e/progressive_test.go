package e2e

import (
	"context"
	"fmt"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/nidhogg/nuka-world/internal/agent"
	"github.com/nidhogg/nuka-world/internal/gateway"
	"github.com/nidhogg/nuka-world/internal/memory"
	"github.com/nidhogg/nuka-world/internal/orchestrator"
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

func TestProgressiveFlow(t *testing.T) {
	ctx := context.Background()

	// L1 shared state
	agentID, engine, provRouter := setupL1Agent(t)
	seedCount, err := seedTestData(ctx, testMemStore, agentID)
	if err != nil {
		t.Fatalf("seed data: %v", err)
	}
	t.Logf("Seeded %d memories for agent %s", seedCount, agentID)

	// Baseline memory count (before LLM tests add new memories)
	baselineMems, _ := testMemStore.GetMemories(ctx, agentID, 100)
	baselineMemCount := len(baselineMems)

	t.Run("L1_SingleAgent", func(t *testing.T) {
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
			for i := 1; i < len(result.Nodes); i++ {
				if result.Nodes[i].Activation > result.Nodes[i-1].Activation {
					t.Errorf("nodes not sorted: [%d]=%f > [%d]=%f",
						i, result.Nodes[i].Activation,
						i-1, result.Nodes[i-1].Activation)
				}
			}
			for _, n := range result.Nodes {
				if n.Activation < 0.3 {
					t.Errorf("node %s below threshold: %f", n.ID, n.Activation)
				}
			}
			t.Logf("Recalled %d nodes in %v", len(result.Nodes), result.Duration)
		})

		t.Run("SchemaMatching", func(t *testing.T) {
			matches, err := testMemStore.MatchSchemas(ctx, agentID, []string{"Go", "并发"})
			if err != nil {
				t.Fatalf("MatchSchemas: %v", err)
			}
			if len(matches) == 0 {
				t.Fatal("expected schema matches, got 0")
			}
			if matches[0].Schema.Name != "Go并发" {
				t.Errorf("top match = %q, want %q", matches[0].Schema.Name, "Go并发")
			}
			if matches[0].Score <= 0.5 {
				t.Errorf("top score = %f, want > 0.5", matches[0].Score)
			}
			for i := 1; i < len(matches); i++ {
				if matches[i].Score > matches[i-1].Score {
					t.Errorf("matches not sorted: [%d]=%f > [%d]=%f",
						i, matches[i].Score, i-1, matches[i-1].Score)
				}
			}
			t.Logf("Matched %d schemas, top: %s (%.2f)",
				len(matches), matches[0].Schema.Name, matches[0].Score)
		})

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
			totalTokens := 0
			for _, b := range blocks {
				totalTokens += b.TokenEstimate
			}
			if totalTokens > budget.MaxTokens {
				t.Errorf("total tokens %d exceeds budget %d", totalTokens, budget.MaxTokens)
			}
			prompt := memory.FormatContextPrompt(blocks)
			if !strings.HasPrefix(prompt, "[Memory Context]") {
				t.Errorf("prompt should start with [Memory Context], got: %.50s", prompt)
			}
			t.Logf("Built %d blocks, %d tokens", len(blocks), totalTokens)
		})

		t.Run("CognitiveLoop", func(t *testing.T) {
			skipIfNoLLM(t)

			result, err := engine.Execute(ctx, agentID, "你好，介绍一下你自己")
			if err != nil {
				t.Fatalf("Execute: %v", err)
			}
			if result.Content == "" {
				t.Fatal("expected non-empty response")
			}
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
		t.Run("ToolExecution", func(t *testing.T) {
			skipIfNoLLM(t)

			result, err := engine.Execute(ctx, agentID, "请用计算器算一下 123 + 456")
			if err != nil {
				t.Fatalf("Execute: %v", err)
			}
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
	})

	t.Run("L2_TeamCollaboration", func(t *testing.T) {
		skipIfNoLLM(t)

		teamID, steward := setupL2Team(t, engine, provRouter, agentID)
		var stewardResult *orchestrator.StewardResult

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
			roles := make(map[string]bool)
			for _, tr := range stewardResult.Tasks {
				roles[tr.AgentID] = true
			}
			t.Logf("Intent: %s, Tasks: %d, Roles: %v",
				stewardResult.Intent.Action, len(stewardResult.Tasks), roles)
		})

		t.Run("ParallelDispatch", func(t *testing.T) {
			if stewardResult == nil {
				t.Skip("depends on TaskDecomposition")
			}
			for _, tr := range stewardResult.Tasks {
				if tr.Status != orchestrator.TaskDone {
					t.Errorf("task %s status = %s, want done", tr.TaskID, tr.Status)
				}
			}
			if stewardResult.Duration == 0 {
				t.Error("expected non-zero Duration")
			}
			t.Logf("Dispatch completed in %v, %d tasks",
				stewardResult.Duration, len(stewardResult.Tasks))
		})

		t.Run("ResultAggregation", func(t *testing.T) {
			if stewardResult == nil {
				t.Skip("depends on TaskDecomposition")
			}
			if stewardResult.Summary == "" {
				t.Fatal("expected non-empty Summary")
			}
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
	})

	t.Run("L3_GatewayIntegration", func(t *testing.T) {
		// L3 needs the steward from L2 setup — create one if L2 was skipped
		_, l3Steward := setupL2Team(t, engine, provRouter, agentID)
		capture, _ := setupL3Gateway(t, engine, l3Steward)

		t.Run("AgentRouting", func(t *testing.T) {
			skipIfNoLLM(t)
			capture.Reset()

			capture.Inject(&gateway.InboundMessage{
				ChannelID: "ch-test-1",
				UserID:    "user-1",
				UserName:  "tester",
				Content:   "@Nora 你今天心情怎么样？",
			})

			time.Sleep(5 * time.Second)

			sent := capture.Sent()
			if len(sent) == 0 {
				t.Fatal("expected at least 1 outbound message")
			}
			last := sent[len(sent)-1]
			if last.Content == "" {
				t.Error("expected non-empty response content")
			}
			if last.ChannelID != "ch-test-1" {
				t.Errorf("channel = %q, want ch-test-1", last.ChannelID)
			}
			t.Logf("Agent reply: %.100s...", last.Content)
		})

		t.Run("TeamRouting", func(t *testing.T) {
			skipIfNoLLM(t)
			capture.Reset()

			capture.Inject(&gateway.InboundMessage{
				ChannelID: "ch-test-2",
				UserID:    "user-1",
				UserName:  "tester",
				Content:   "@team-research 分析Go并发模型并翻译",
			})

			time.Sleep(30 * time.Second)

			sent := capture.Sent()
			if len(sent) < 2 {
				t.Errorf("expected ≥2 messages (status + result), got %d", len(sent))
			}
			if len(sent) > 0 {
				last := sent[len(sent)-1]
				if last.Content == "" {
					t.Error("expected non-empty final message")
				}
				t.Logf("Team reply (%d msgs): %.200s...", len(sent), last.Content)
			}
		})

		t.Run("FallbackBehavior", func(t *testing.T) {
			capture.Reset()

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

		t.Run("SessionPersistence", func(t *testing.T) {
			skipIfNoLLM(t)

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
	})
}

