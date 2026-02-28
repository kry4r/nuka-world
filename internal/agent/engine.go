package agent

import (
	"context"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/nidhogg/nuka-world/internal/memory"
	"github.com/nidhogg/nuka-world/internal/provider"
	"go.uber.org/zap"
)

// AgentPersister is an optional interface for persisting agents.
type AgentPersister interface {
	SaveAgent(ctx context.Context, a *Agent) error
}

// RAGProvider abstracts RAG operations for the engine.
type RAGProvider interface {
	Query(ctx context.Context, agentID, query string, topK int) ([]RAGQueryResult, error)
	Store(ctx context.Context, collection, content string, metadata map[string]string) error
}

// RAGQueryResult holds a single RAG retrieval hit.
type RAGQueryResult struct {
	Content string
	Source  string
	Score   float32
}

// SkillProvider abstracts the skill manager to avoid circular imports.
type SkillProvider interface {
	// GetAgentSkillPrompt returns a formatted prompt fragment for all skills
	// assigned to the given agent. Returns "" if no skills are assigned.
	GetAgentSkillPrompt(agentID string) string
	// GetAgentToolNames returns the deduplicated tool names from all skills
	// assigned to the given agent.
	GetAgentToolNames(agentID string) []string
}

// Engine manages agent execution.
type Engine struct {
	agents           map[string]*Agent
	router           *provider.Router
	memory           *memory.Store
	tools            *ToolRegistry
	persister        AgentPersister
	skillMgr         SkillProvider
	rag              RAGProvider
	pendingSchedules []ScheduleRequest
	mu               sync.RWMutex
	logger           *zap.Logger
}

// NewEngine creates a new agent engine.
func NewEngine(router *provider.Router, mem *memory.Store, logger *zap.Logger) *Engine {
	e := &Engine{
		agents: make(map[string]*Agent),
		router: router,
		memory: mem,
		logger: logger,
	}
	e.tools = NewToolRegistry()
	RegisterBuiltinTools(e.tools, e)
	return e
}

// Tools returns the engine's tool registry.
func (e *Engine) Tools() *ToolRegistry { return e.tools }

// SetPersister sets an optional agent persister for database storage.
func (e *Engine) SetPersister(p AgentPersister) { e.persister = p }

// SetSkillManager sets an optional skill provider for skill-based prompt injection and tool filtering.
func (e *Engine) SetSkillManager(m SkillProvider) { e.skillMgr = m }

// SetRAG sets an optional RAG provider for retrieval-augmented generation.
func (e *Engine) SetRAG(r RAGProvider) { e.rag = r }

func (e *Engine) addPendingSchedule(s ScheduleRequest) {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.pendingSchedules = append(e.pendingSchedules, s)
}

// DrainSchedules returns and clears all pending schedule requests.
func (e *Engine) DrainSchedules() []ScheduleRequest {
	e.mu.Lock()
	defer e.mu.Unlock()
	out := e.pendingSchedules
	e.pendingSchedules = nil
	return out
}

// Register adds an agent to the engine.
func (e *Engine) Register(a *Agent) {
	e.mu.Lock()
	defer e.mu.Unlock()
	if a.Persona.ID == "" {
		a.Persona.ID = uuid.New().String()
	}
	if a.CreatedAt.IsZero() {
		a.CreatedAt = time.Now()
	}
	a.UpdatedAt = time.Now()
	if a.Status == "" {
		a.Status = StatusIdle
	}
	e.agents[a.Persona.ID] = a

	// Bind agent to its declared provider so the router uses the correct one.
	if a.ProviderID != "" {
		e.router.Bind(a.Persona.ID, a.ProviderID)
	}

	if e.persister != nil {
		if err := e.persister.SaveAgent(context.Background(), a); err != nil {
			e.logger.Error("failed to persist agent", zap.String("id", a.Persona.ID), zap.Error(err))
		}
	}

	e.logger.Info("registered agent",
		zap.String("id", a.Persona.ID),
		zap.String("name", a.Persona.Name))
}

// Get returns an agent by ID.
func (e *Engine) Get(id string) (*Agent, bool) {
	e.mu.RLock()
	defer e.mu.RUnlock()
	a, ok := e.agents[id]
	return a, ok
}

// List returns all registered agents.
func (e *Engine) List() []*Agent {
	e.mu.RLock()
	defer e.mu.RUnlock()
	result := make([]*Agent, 0, len(e.agents))
	for _, a := range e.agents {
		result = append(result, a)
	}
	return result
}

// ListAgentIDs returns all registered agent IDs.
func (e *Engine) ListAgentIDs() []string {
	e.mu.RLock()
	defer e.mu.RUnlock()
	ids := make([]string, 0, len(e.agents))
	for id := range e.agents {
		ids = append(ids, id)
	}
	return ids
}

// Remove deletes an agent from the engine.
func (e *Engine) Remove(id string) bool {
	e.mu.Lock()
	defer e.mu.Unlock()
	if _, ok := e.agents[id]; !ok {
		return false
	}
	delete(e.agents, id)
	e.logger.Info("removed agent", zap.String("id", id))
	return true
}

// Execute runs the agent's cognitive loop for a single message.
func (e *Engine) Execute(ctx context.Context, agentID string, userMsg string) (*ExecuteResult, error) {
	agent, ok := e.Get(agentID)
	if !ok {
		return nil, ErrAgentNotFound
	}

	chain := &ThinkingChain{
		ID:        uuid.New().String(),
		AgentID:   agentID,
		StartedAt: time.Now(),
	}

	e.setStatus(agentID, StatusThinking)
	defer e.setStatus(agentID, StatusIdle)

	// Step 1: Memory recall via spreading activation
	var memoryContext string
	if e.memory != nil {
		chain.Steps = append(chain.Steps, ThinkStep{
			Type:      StepMemoryRecall,
			Content:   "Recalling relevant memories",
			Timestamp: time.Now(),
		})

		triggers := extractKeywords(userMsg)
		blocks, err := e.memory.BuildContext(ctx, agentID, triggers, memory.DefaultContextBudget())
		if err != nil {
			e.logger.Warn("memory recall failed", zap.Error(err))
		} else if len(blocks) > 0 {
			memoryContext = memory.FormatContextPrompt(blocks)
			chain.Steps = append(chain.Steps, ThinkStep{
				Type:    StepMemoryRecall,
				Content: fmt.Sprintf("Recalled %d memory blocks", len(blocks)),
				Timestamp: time.Now(),
			})
		}
	}

	// Step 1.5: RAG retrieval
	var ragContext string
	if e.rag != nil {
		ragResults, ragErr := e.rag.Query(ctx, agentID, userMsg, 5)
		if ragErr != nil {
			e.logger.Warn("RAG query failed", zap.Error(ragErr))
		} else if len(ragResults) > 0 {
			var ragParts []string
			for _, r := range ragResults {
				ragParts = append(ragParts, fmt.Sprintf("[%s] %s", r.Source, r.Content))
			}
			ragContext = "## Retrieved Context (RAG)\n\n" + strings.Join(ragParts, "\n\n")
		}
	}

	// Step 2: Build messages with system prompt + persona + memory + RAG
	messages := e.buildMessages(agent, userMsg, memoryContext, ragContext)

	// Step 3: Record reasoning step
	chain.Steps = append(chain.Steps, ThinkStep{
		Type:      StepReasoning,
		Content:   "Sending request to LLM",
		Timestamp: time.Now(),
	})

	// Step 4: Call LLM via provider router (with tool loop)
	req := &provider.ChatRequest{
		Model:     agent.Model,
		Messages:  messages,
		MaxTokens: 4096,
	}
	if len(e.tools.Definitions()) > 0 {
		req.Tools = e.tools.Definitions()
		if e.skillMgr != nil {
			allowedTools := e.skillMgr.GetAgentToolNames(agentID)
			if len(allowedTools) > 0 {
				req.Tools = e.tools.FilterDefinitions(allowedTools)
			}
		}
		if len(req.Tools) > 0 {
			req.ToolChoice = "auto"
		}
	}

	const maxToolRounds = 5
	var resp *provider.ChatResponse
	for round := 0; round < maxToolRounds; round++ {
		var routeErr error
		resp, routeErr = e.router.Route(ctx, agentID, req)
		if routeErr != nil {
			return nil, routeErr
		}

		// If no tool calls, we're done
		if len(resp.ToolCalls) == 0 || resp.FinishReason != "tool_calls" {
			break
		}

		// Record tool call step
		chain.Steps = append(chain.Steps, ThinkStep{
			Type:      StepToolCall,
			Content:   fmt.Sprintf("Calling %d tool(s)", len(resp.ToolCalls)),
			Timestamp: time.Now(),
		})

		// Append assistant message with tool_calls
		req.Messages = append(req.Messages, provider.Message{
			Role:      "assistant",
			Content:   resp.Content,
			ToolCalls: resp.ToolCalls,
		})

		// Execute each tool and append results
		for _, tc := range resp.ToolCalls {
			result, toolErr := e.tools.Execute(ctx, tc.Function.Name, tc.Function.Arguments)
			if toolErr != nil {
				result = fmt.Sprintf(`{"error":"%s"}`, toolErr.Error())
			}
			chain.Steps = append(chain.Steps, ThinkStep{
				Type:      StepToolResult,
				Content:   fmt.Sprintf("%s → %s", tc.Function.Name, truncateStr(result, 200)),
				Timestamp: time.Now(),
			})
			req.Messages = append(req.Messages, provider.Message{
				Role:       "tool",
				Content:    result,
				ToolCallID: tc.ID,
			})
		}

		e.logger.Debug("tool round complete",
			zap.Int("round", round+1),
			zap.Int("tool_calls", len(resp.ToolCalls)))
	}

	// Step 5: Record response
	chain.Steps = append(chain.Steps, ThinkStep{
		Type:       StepResponse,
		Content:    resp.Content,
		Timestamp:  time.Now(),
		TokensUsed: resp.Usage.TotalTokens,
	})

	// Step 6: Process response into memory (async-safe)
	if e.memory != nil {
		keywords := extractKeywords(resp.Content)
		if len(keywords) > 0 {
			_, procErr := e.memory.Process(ctx, agentID, resp.Content, keywords, 0.5)
			if procErr != nil {
				e.logger.Warn("memory processing failed", zap.Error(procErr))
			} else {
				chain.Steps = append(chain.Steps, ThinkStep{
					Type:      StepSchemaUpdate,
					Content:   "Processed response into memory graph",
					Timestamp: time.Now(),
				})
			}
		}
	}

	// Step 7: Index conversation into RAG (async)
	if e.rag != nil {
		go func() {
			storeCtx := context.Background()
			_ = e.rag.Store(storeCtx, "conversations", userMsg+"\n"+resp.Content, map[string]string{
				"agent_id": agentID,
				"role":     "conversation",
			})
		}()
	}

	chain.Duration = time.Since(chain.StartedAt)

	return &ExecuteResult{
		Content:  resp.Content,
		Chain:    chain,
		Usage:    resp.Usage,
	}, nil
}

// ExecuteResult holds the output of an agent execution.
type ExecuteResult struct {
	Content string            `json:"content"`
	Chain   *ThinkingChain    `json:"chain"`
	Usage   provider.Usage    `json:"usage"`
}

// RouteRaw sends a ChatRequest directly through the provider router,
// bypassing the cognitive loop. Used by the orchestrator for internal LLM calls.
func (e *Engine) RouteRaw(ctx context.Context, agentID string, req *provider.ChatRequest) (*provider.ChatResponse, error) {
	return e.router.Route(ctx, agentID, req)
}

// ErrAgentNotFound is returned when an agent ID doesn't exist.
var ErrAgentNotFound = fmt.Errorf("agent not found")

func (e *Engine) setStatus(agentID string, s Status) {
	e.mu.Lock()
	defer e.mu.Unlock()
	if a, ok := e.agents[agentID]; ok {
		a.Status = s
		a.UpdatedAt = time.Now()
	}
}

func (e *Engine) buildMessages(a *Agent, userMsg string, memoryCtx string, ragCtx string) []provider.Message {
	msgs := []provider.Message{
		{Role: "system", Content: a.Persona.SystemPrompt},
	}
	if profile := LoadProfile(a.Persona.ID); profile != "" {
		msgs = append(msgs, provider.Message{
			Role:    "system",
			Content: profile,
		})
	}
	if a.Persona.Personality != "" {
		msgs = append(msgs, provider.Message{
			Role:    "system",
			Content: fmt.Sprintf("你是 %s，%s。\n背景：%s", a.Persona.Name, a.Persona.Personality, a.Persona.Backstory),
		})
	}
	if memoryCtx != "" {
		msgs = append(msgs, provider.Message{
			Role:    "system",
			Content: memoryCtx,
		})
	}
	if ragCtx != "" {
		msgs = append(msgs, provider.Message{
			Role:    "system",
			Content: ragCtx,
		})
	}
	if e.skillMgr != nil {
		if skillPrompt := e.skillMgr.GetAgentSkillPrompt(a.Persona.ID); skillPrompt != "" {
			msgs = append(msgs, provider.Message{
				Role:    "system",
				Content: skillPrompt,
			})
		}
	}
	msgs = append(msgs, provider.Message{
		Role:    "user",
		Content: userMsg,
	})
	return msgs
}

// extractKeywords does a simple keyword extraction from text.
// Splits on whitespace/punctuation, filters short words and stopwords.
func extractKeywords(text string) []string {
	words := strings.FieldsFunc(text, func(r rune) bool {
		return !((r >= 'a' && r <= 'z') ||
			(r >= 'A' && r <= 'Z') ||
			(r >= '0' && r <= '9') ||
			r == '_' || r == '-' ||
			r > 127)
	})

	seen := make(map[string]bool)
	var result []string
	for _, w := range words {
		lower := strings.ToLower(w)
		if len(lower) < 3 || stopwords[lower] || seen[lower] {
			continue
		}
		seen[lower] = true
		result = append(result, lower)
		if len(result) >= 20 {
			break
		}
	}
	return result
}

func truncateStr(s string, max int) string {
	if len(s) <= max {
		return s
	}
	return s[:max] + "..."
}

var stopwords = map[string]bool{
	"the": true, "and": true, "for": true, "are": true,
	"but": true, "not": true, "you": true, "all": true,
	"can": true, "had": true, "her": true, "was": true,
	"one": true, "our": true, "out": true, "has": true,
	"have": true, "been": true, "this": true, "that": true,
	"with": true, "from": true, "they": true, "will": true,
	"what": true, "when": true, "make": true, "like": true,
	"just": true, "into": true, "than": true, "them": true,
	"some": true, "could": true, "would": true, "there": true,
}
