# Nuka World Enhancement Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add slash commands, plugin-style skills, Qdrant-backed RAG, and LLM-in-the-loop tests to Nuka World.

**Architecture:** Bottom-up — command framework first, then skill system, then RAG infrastructure (embedding → Qdrant → orchestrator), then wire skills to tools, finally tests. Each task is independently compilable.

**Tech Stack:** Go, chi router, Qdrant (gRPC), Neo4j, PostgreSQL, testcontainers-go

---

### Task 1: Slash Command Framework — Registry & Interface

**Files:**
- Create: `internal/command/command.go`

**Step 1: Create the command package with core types and registry**

```go
package command

import (
	"context"
	"fmt"
	"sort"
	"strings"
	"sync"
)

// Command represents a slash command.
type Command struct {
	Name        string
	Description string
	Usage       string
	Handler     CommandHandler
}

// CommandHandler is the function signature for command execution.
type CommandHandler func(ctx context.Context, args string, cc *CommandContext) (*CommandResult, error)

// CommandContext provides dependencies to command handlers.
type CommandContext struct {
	Platform  string
	ChannelID string
	UserID    string
	UserName  string
	Engine    interface{} // *agent.Engine — avoid circular import
	Store     interface{} // *store.Store
}

// CommandResult holds the output of a command.
type CommandResult struct {
	Content string      `json:"content"`
	Data    interface{} `json:"data,omitempty"`
}

// Registry holds all registered commands.
type Registry struct {
	commands map[string]*Command
	mu       sync.RWMutex
}

// NewRegistry creates an empty command registry.
func NewRegistry() *Registry {
	return &Registry{commands: make(map[string]*Command)}
}

// Register adds a command to the registry.
func (r *Registry) Register(cmd *Command) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.commands[cmd.Name] = cmd
}

// Dispatch parses a slash command string and executes the matching handler.
func (r *Registry) Dispatch(ctx context.Context, input string, cc *CommandContext) (*CommandResult, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	// Parse: "/command_name args..."
	input = strings.TrimPrefix(input, "/")
	parts := strings.SplitN(input, " ", 2)
	name := parts[0]
	args := ""
	if len(parts) > 1 {
		args = strings.TrimSpace(parts[1])
	}

	cmd, ok := r.commands[name]
	if !ok {
		return &CommandResult{
			Content: fmt.Sprintf("Unknown command: /%s. Type /help for available commands.", name),
		}, nil
	}

	return cmd.Handler(ctx, args, cc)
}

// List returns all registered commands sorted by name.
func (r *Registry) List() []*Command {
	r.mu.RLock()
	defer r.mu.RUnlock()
	result := make([]*Command, 0, len(r.commands))
	for _, cmd := range r.commands {
		result = append(result, cmd)
	}
	sort.Slice(result, func(i, j int) bool {
		return result[i].Name < result[j].Name
	})
	return result
}
```

**Step 2: Verify compilation**

Run: `go build ./internal/command/...`
Expected: PASS.

**Step 3: Commit**

```bash
git add internal/command/command.go
git commit -m "feat(command): add slash command registry and core types"
```

---

### Task 2: Built-in Slash Commands — /help, /agents, /mcp, /status, /skills

**Files:**
- Create: `internal/command/builtin.go`

**Step 1: Create built-in command implementations**

Create `internal/command/builtin.go` with a `RegisterBuiltins` function that registers `/help`, `/agents`, `/mcp`, `/status`, `/skills` commands.

Each command handler:
- `/help` — iterates `Registry.List()`, formats name + description + usage
- `/agents` — casts `cc.Engine` to `*agent.Engine`, calls `List()`, formats agent ID/name/role/status
- `/mcp` — accepts an `MCPLister` interface (`ListTools() []ToolInfo`), formats server names + tool counts
- `/status` — accepts a `StatusProvider` interface (`StatusAll() []AdapterStatus`), formats connection status
- `/skills` — accepts a `SkillLister` interface (`ListSkills() []SkillInfo`), formats skill names (placeholder for now, returns "No skills registered yet")

Use interfaces instead of concrete types to avoid circular imports. The `RegisterBuiltins` function accepts these interfaces as parameters.

**Step 2: Verify compilation**

Run: `go build ./internal/command/...`
Expected: PASS.

**Step 3: Commit**

```bash
git add internal/command/builtin.go
git commit -m "feat(command): add built-in /help /agents /mcp /status /skills commands"
```

---

### Task 3: Router Integration — Intercept Slash Commands

**Files:**
- Modify: `internal/router/router.go`

**Step 1: Add command registry to MessageRouter**

Add a `commands` field to the `MessageRouter` struct (line 17) and update the `New()` constructor to accept `*command.Registry`.

```go
type MessageRouter struct {
	engine   *agent.Engine
	gw       *gateway.Gateway
	steward  *orchestrator.Steward
	store    *store.Store
	commands *command.Registry
	logger   *zap.Logger
}
```

**Step 2: Add slash command interception in Handle()**

At the top of `Handle()` (line 40), before agent/team resolution, add:

```go
if strings.HasPrefix(msg.Content, "/") {
	cc := &command.CommandContext{
		Platform:  msg.Platform,
		ChannelID: msg.ChannelID,
		UserID:    msg.UserID,
		UserName:  msg.UserName,
		Engine:    r.engine,
		Store:     r.store,
	}
	result, err := r.commands.Dispatch(ctx, msg.Content, cc)
	if err != nil {
		r.logger.Error("command dispatch error", zap.Error(err))
		r.sendReply(ctx, msg, "Command error: "+err.Error())
		return
	}
	r.sendReply(ctx, msg, result.Content)
	return
}
```

**Step 3: Update main.go to wire command registry**

In `cmd/nuka/main.go`, create the command registry, register builtins, and pass it to `msgrouter.New()`.

**Step 4: Verify compilation**

Run: `go build ./...`
Expected: PASS.

**Step 5: Commit**

```bash
git add internal/router/router.go cmd/nuka/main.go
git commit -m "feat(router): intercept slash commands before agent routing"
```

---

### Task 4: Skill System — Model, Loader & Manager

**Files:**
- Create: `internal/skill/skill.go`
- Create: `internal/skill/loader.go`
- Create: `internal/skill/manager.go`

**Step 1: Create skill model**

Create `internal/skill/skill.go` with the `Skill` struct:

```go
package skill

type Skill struct {
	ID             string   `json:"id"`
	Name           string   `json:"name"`
	Description    string   `json:"description"`
	PromptFragment string   `json:"prompt_fragment"`
	ToolNames      []string `json:"tool_names"`
	Source         string   `json:"source"` // "builtin", "plugin", "db"
}
```

**Step 2: Create plugin directory loader**

Create `internal/skill/loader.go` with `LoadFromDir(dir string) ([]*Skill, error)` that:
- Scans `dir` for subdirectories
- Reads `skill.json` from each subdirectory
- Optionally reads `prompt.md` to override `prompt_fragment`
- Returns loaded skills with `Source: "plugin"`

**Step 3: Create skill manager**

Create `internal/skill/manager.go` with `Manager` struct that:
- Holds all skills (merged from builtin + plugin + DB)
- Tracks agent-skill assignments (`map[string][]string` — agentID → skillIDs)
- `AssignSkill(agentID, skillID)` / `UnassignSkill(agentID, skillID)`
- `GetAgentSkills(agentID string) []*Skill` — returns skills for a specific agent
- `FormatSkillPrompt(skills []*Skill) string` — formats skills for system prompt injection

**Step 4: Verify compilation**

Run: `go build ./internal/skill/...`
Expected: PASS.

**Step 5: Commit**

```bash
git add internal/skill/
git commit -m "feat(skill): add skill model, plugin loader, and manager"
```

---

### Task 5: Skill Database Schema & Persistence

**Files:**
- Create: `migrations/002_skills.up.sql`
- Modify: `internal/store/store.go` (add skill CRUD methods)

**Step 1: Create migration file**

```sql
-- Nuka World: Skills Schema

CREATE TABLE IF NOT EXISTS skills (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(100) NOT NULL UNIQUE,
    description     TEXT,
    prompt_fragment TEXT,
    tool_names      JSONB DEFAULT '[]',
    source          VARCHAR(20) DEFAULT 'db',
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agent_skills (
    agent_id  VARCHAR(100) NOT NULL,
    skill_id  UUID REFERENCES skills(id) ON DELETE CASCADE,
    PRIMARY KEY (agent_id, skill_id)
);
```

**Step 2: Add skill persistence methods to store**

Add to `internal/store/store.go`:
- `SaveSkill(ctx, *skill.Skill) error`
- `ListSkills(ctx) ([]*skill.Skill, error)`
- `AssignSkill(ctx, agentID, skillID string) error`
- `UnassignSkill(ctx, agentID, skillID string) error`
- `GetAgentSkillIDs(ctx, agentID string) ([]string, error)`

**Step 3: Verify compilation**

Run: `go build ./...`
Expected: PASS.

**Step 4: Commit**

```bash
git add migrations/002_skills.up.sql internal/store/store.go
git commit -m "feat(skill): add skills DB schema and persistence methods"
```

---

### Task 6: Wire Skills into Agent Engine

**Files:**
- Modify: `internal/agent/engine.go`
- Modify: `cmd/nuka/main.go`

**Step 1: Add SkillManager to Engine**

Add a `skillMgr *skill.Manager` field to the `Engine` struct (line 22). Add `SetSkillManager(m *skill.Manager)` setter method.

**Step 2: Inject skills into buildMessages()**

In `buildMessages()` (line 288), after persona prompt injection, add skill prompt injection:

```go
if e.skillMgr != nil {
	agentSkills := e.skillMgr.GetAgentSkills(a.Persona.ID)
	if len(agentSkills) > 0 {
		msgs = append(msgs, provider.Message{
			Role:    "system",
			Content: e.skillMgr.FormatSkillPrompt(agentSkills),
		})
	}
}
```

**Step 3: Filter tools by agent skills**

In `Execute()` (line 119), before building the ChatRequest, filter available tools to only include those bound to the agent's skills:

```go
if e.skillMgr != nil {
	allowedTools := e.skillMgr.GetAgentToolNames(agentID)
	if len(allowedTools) > 0 {
		req.Tools = e.tools.FilterDefinitions(allowedTools)
	}
}
```

Add `FilterDefinitions(names []string) []provider.Tool` to `ToolRegistry`.

**Step 4: Wire in main.go**

In `cmd/nuka/main.go`, after engine creation:
- Create `skill.Manager`
- Load skills from plugin dir (`skills/`)
- Load skills from DB (if pgStore available)
- Set manager on engine: `engine.SetSkillManager(skillMgr)`

**Step 5: Verify compilation**

Run: `go build ./...`
Expected: PASS.

**Step 6: Commit**

```bash
git add internal/agent/engine.go internal/agent/tools.go cmd/nuka/main.go
git commit -m "feat(agent): wire skill manager into engine prompt building and tool filtering"
```

---

### Task 7: Create Commands — /create_agent, /create_skill, /create_team, /create_schedule

**Files:**
- Create: `internal/command/create.go`

**Step 1: Implement create commands**

Create `internal/command/create.go` with a `RegisterCreateCommands` function that registers:

- `/create_agent <description>` — parses natural language description, creates `agent.Agent` with generated persona fields, registers via engine, persists to DB. Uses LLM to generate structured persona from description (name, role, personality, system prompt).
- `/create_skill <agent_id> <description>` — creates a skill entry in DB, assigns to specified agent. Description becomes the prompt fragment.
- `/create_team <name> <agent_id1,agent_id2,...>` — creates team with specified agents via orchestrator.
- `/create_schedule <agent_id> <type> <description>` — creates a schedule request via engine.

The `RegisterCreateCommands` function accepts interfaces for the dependencies it needs (engine, store, skill manager).

For `/create_agent`, the handler should:
1. Call the LLM via engine to generate a structured JSON persona from the description
2. Parse the JSON response into an `agent.Agent`
3. Register the agent via engine
4. Return confirmation with the new agent's ID and name

**Step 2: Verify compilation**

Run: `go build ./internal/command/...`
Expected: PASS.

**Step 3: Commit**

```bash
git add internal/command/create.go
git commit -m "feat(command): add /create_agent /create_skill /create_team /create_schedule"
```

---

### Task 8: Embedding Provider — Abstraction & API Implementation

**Files:**
- Create: `internal/embedding/embedding.go`
- Create: `internal/embedding/api.go`
- Create: `internal/embedding/local.go`

**Step 1: Create embedding provider interface and config**

Create `internal/embedding/embedding.go`:

```go
package embedding

import "context"

// Provider generates vector embeddings from text.
type Provider interface {
	Embed(ctx context.Context, texts []string) ([][]float32, error)
	Dimension() int
}

// Config holds embedding provider configuration.
type Config struct {
	Provider string `json:"provider"` // "api" or "local"
	Endpoint string `json:"endpoint"`
	Model    string `json:"model"`
	APIKey   string `json:"api_key"`
	Dimension int   `json:"dimension"` // override if known
}
```

**Step 2: Create API embedding provider**

Create `internal/embedding/api.go` with `APIProvider` struct that:
- Implements `Provider` interface
- Sends POST to `{endpoint}/embeddings` with OpenAI-compatible request body: `{"model": model, "input": texts}`
- Parses response `{"data": [{"embedding": [...]}]}`
- Returns `[][]float32` from response
- `Dimension()` returns the length of the first embedding result (cached after first call), or `Config.Dimension` if set

```go
package embedding

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"sync"
)

type APIProvider struct {
	cfg       Config
	client    *http.Client
	dim       int
	dimOnce   sync.Once
}

func NewAPIProvider(cfg Config) *APIProvider {
	return &APIProvider{
		cfg:    cfg,
		client: &http.Client{},
		dim:    cfg.Dimension,
	}
}

type embeddingRequest struct {
	Model string   `json:"model"`
	Input []string `json:"input"`
}

type embeddingResponse struct {
	Data []struct {
		Embedding []float32 `json:"embedding"`
	} `json:"data"`
}

func (p *APIProvider) Embed(ctx context.Context, texts []string) ([][]float32, error) {
	body, _ := json.Marshal(embeddingRequest{Model: p.cfg.Model, Input: texts})
	req, err := http.NewRequestWithContext(ctx, "POST", p.cfg.Endpoint+"/embeddings", bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	if p.cfg.APIKey != "" {
		req.Header.Set("Authorization", "Bearer "+p.cfg.APIKey)
	}

	resp, err := p.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("embedding request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("embedding API %d: %s", resp.StatusCode, string(b))
	}

	var result embeddingResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("decode embedding response: %w", err)
	}

	vectors := make([][]float32, len(result.Data))
	for i, d := range result.Data {
		vectors[i] = d.Embedding
	}

	if len(vectors) > 0 && len(vectors[0]) > 0 {
		p.dimOnce.Do(func() { p.dim = len(vectors[0]) })
	}

	return vectors, nil
}

func (p *APIProvider) Dimension() int { return p.dim }
```

**Step 3: Create local embedding provider (Ollama-compatible)**

Create `internal/embedding/local.go` with `LocalProvider` struct that:
- Same HTTP approach but targets `{endpoint}/api/embeddings` (Ollama format)
- Request body: `{"model": model, "prompt": text}` (one at a time, loop for batch)
- Implements `Provider` interface

```go
package embedding

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"sync"
)

type LocalProvider struct {
	cfg     Config
	client  *http.Client
	dim     int
	dimOnce sync.Once
}

func NewLocalProvider(cfg Config) *LocalProvider {
	return &LocalProvider{
		cfg:    cfg,
		client: &http.Client{},
		dim:    cfg.Dimension,
	}
}

type ollamaEmbedRequest struct {
	Model  string `json:"model"`
	Prompt string `json:"prompt"`
}

type ollamaEmbedResponse struct {
	Embedding []float32 `json:"embedding"`
}

func (p *LocalProvider) Embed(ctx context.Context, texts []string) ([][]float32, error) {
	vectors := make([][]float32, 0, len(texts))
	for _, text := range texts {
		body, _ := json.Marshal(ollamaEmbedRequest{Model: p.cfg.Model, Prompt: text})
		req, err := http.NewRequestWithContext(ctx, "POST", p.cfg.Endpoint+"/api/embeddings", bytes.NewReader(body))
		if err != nil {
			return nil, fmt.Errorf("create request: %w", err)
		}
		req.Header.Set("Content-Type", "application/json")

		resp, err := p.client.Do(req)
		if err != nil {
			return nil, fmt.Errorf("local embedding request: %w", err)
		}
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusOK {
			b, _ := io.ReadAll(resp.Body)
			return nil, fmt.Errorf("local embedding %d: %s", resp.StatusCode, string(b))
		}

		var result ollamaEmbedResponse
		if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
			return nil, fmt.Errorf("decode local embedding: %w", err)
		}
		vectors = append(vectors, result.Embedding)
	}

	if len(vectors) > 0 && len(vectors[0]) > 0 {
		p.dimOnce.Do(func() { p.dim = len(vectors[0]) })
	}

	return vectors, nil
}

func (p *LocalProvider) Dimension() int { return p.dim }
```

**Step 4: Verify compilation**

Run: `go build ./internal/embedding/...`
Expected: PASS.

**Step 5: Commit**

```bash
git add internal/embedding/
git commit -m "feat(embedding): add embedding provider abstraction with API and local implementations"
```

---

### Task 9: Qdrant Vector Store — Client Wrapper & Collection Management

**Files:**
- Create: `internal/vectorstore/qdrant.go`
- Modify: `docker-compose.yml`

**Step 1: Add Qdrant Go client dependency**

Run: `go get github.com/qdrant/go-client`

**Step 2: Create Qdrant client wrapper**

Create `internal/vectorstore/qdrant.go`:

```go
package vectorstore

import (
	"context"
	"fmt"

	pb "github.com/qdrant/go-client/qdrant"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
)

// QdrantConfig holds Qdrant connection settings.
type QdrantConfig struct {
	Host string `json:"host"`
	Port int    `json:"port"`
}

// Client wraps the Qdrant gRPC client.
type Client struct {
	conn        *grpc.ClientConn
	collections pb.CollectionsClient
	points      pb.PointsClient
}

// NewClient connects to Qdrant via gRPC.
func NewClient(cfg QdrantConfig) (*Client, error) {
	addr := fmt.Sprintf("%s:%d", cfg.Host, cfg.Port)
	conn, err := grpc.NewClient(addr, grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		return nil, fmt.Errorf("qdrant connect %s: %w", addr, err)
	}
	return &Client{
		conn:        conn,
		collections: pb.NewCollectionsClient(conn),
		points:      pb.NewPointsClient(conn),
	}, nil
}

// EnsureCollection creates a collection if it doesn't exist.
func (c *Client) EnsureCollection(ctx context.Context, name string, dimension uint64) error {
	_, err := c.collections.Get(ctx, &pb.GetCollectionInfoRequest{CollectionName: name})
	if err == nil {
		return nil // already exists
	}
	_, err = c.collections.Create(ctx, &pb.CreateCollection{
		CollectionName: name,
		VectorsConfig: &pb.VectorsConfig{
			Config: &pb.VectorsConfig_Params{
				Params: &pb.VectorParams{
					Size:     dimension,
					Distance: pb.Distance_Cosine,
				},
			},
		},
	})
	if err != nil {
		return fmt.Errorf("create collection %s: %w", name, err)
	}
	return nil
}

// Upsert inserts or updates vectors with metadata.
func (c *Client) Upsert(ctx context.Context, collection string, id string, vector []float32, payload map[string]string) error {
	payloadMap := make(map[string]*pb.Value)
	for k, v := range payload {
		payloadMap[k] = &pb.Value{Kind: &pb.Value_StringValue{StringValue: v}}
	}
	_, err := c.points.Upsert(ctx, &pb.UpsertPoints{
		CollectionName: collection,
		Points: []*pb.PointStruct{
			{
				Id:      &pb.PointId{PointIdOptions: &pb.PointId_Uuid{Uuid: id}},
				Vectors: &pb.Vectors{VectorsOptions: &pb.Vectors_Vector{Vector: &pb.Vector{Data: vector}}},
				Payload: payloadMap,
			},
		},
	})
	return err
}

// Search finds the top-k nearest vectors.
func (c *Client) Search(ctx context.Context, collection string, vector []float32, topK uint64) ([]*SearchResult, error) {
	resp, err := c.points.Search(ctx, &pb.SearchPoints{
		CollectionName: collection,
		Vector:         vector,
		Limit:          topK,
		WithPayload:    &pb.WithPayloadSelector{SelectorOptions: &pb.WithPayloadSelector_Enable{Enable: true}},
	})
	if err != nil {
		return nil, fmt.Errorf("search %s: %w", collection, err)
	}
	results := make([]*SearchResult, 0, len(resp.Result))
	for _, r := range resp.Result {
		payload := make(map[string]string)
		for k, v := range r.Payload {
			if sv, ok := v.Kind.(*pb.Value_StringValue); ok {
				payload[k] = sv.StringValue
			}
		}
		results = append(results, &SearchResult{
			ID:      r.Id.GetUuid(),
			Score:   r.Score,
			Payload: payload,
		})
	}
	return results, nil
}

// SearchResult holds a single search hit.
type SearchResult struct {
	ID      string
	Score   float32
	Payload map[string]string
}

// Close shuts down the gRPC connection.
func (c *Client) Close() error {
	return c.conn.Close()
}
```

**Step 3: Add Qdrant to docker-compose.yml**

Add after the `redis` service block (before `volumes:`):

```yaml
  qdrant:
    image: qdrant/qdrant:latest
    ports:
      - "6333:6333"
      - "6334:6334"
    volumes:
      - qdrant_data:/qdrant/storage
    healthcheck:
      test: ["CMD-SHELL", "curl -f http://localhost:6333/healthz || exit 1"]
      interval: 5s
      timeout: 3s
      retries: 5
```

Add `qdrant_data:` to the `volumes:` section. Add `qdrant` to the nuka service `depends_on` with `condition: service_healthy`.

**Step 4: Verify compilation**

Run: `go build ./internal/vectorstore/...`
Expected: PASS.

**Step 5: Commit**

```bash
git add internal/vectorstore/qdrant.go docker-compose.yml
git commit -m "feat(vectorstore): add Qdrant gRPC client wrapper and Docker service"
```

---

### Task 10: RAG Orchestrator — Query, Store & Engine Integration

**Files:**
- Create: `internal/rag/rag.go`
- Modify: `internal/agent/engine.go`

**Step 1: Create RAG orchestrator**

Create `internal/rag/rag.go` with `Orchestrator` struct:

```go
package rag

import (
	"context"
	"fmt"
	"sort"
	"time"

	"github.com/google/uuid"
	"github.com/nidhogg/nuka-world/internal/embedding"
	"github.com/nidhogg/nuka-world/internal/vectorstore"
	"go.uber.org/zap"
)

// Collections used by RAG.
const (
	CollConversations = "conversations"
	CollDocuments     = "documents"
	CollWorldEvents   = "world_events"
)

// Orchestrator combines vector search with optional graph memory.
type Orchestrator struct {
	embedder embedding.Provider
	qdrant   *vectorstore.Client
	logger   *zap.Logger
}

// NewOrchestrator creates a RAG orchestrator.
func NewOrchestrator(embedder embedding.Provider, qdrant *vectorstore.Client, logger *zap.Logger) *Orchestrator {
	return &Orchestrator{embedder: embedder, qdrant: qdrant, logger: logger}
}

// InitCollections ensures all required Qdrant collections exist.
func (o *Orchestrator) InitCollections(ctx context.Context) error {
	dim := uint64(o.embedder.Dimension())
	if dim == 0 {
		dim = 1024 // sensible default
	}
	for _, name := range []string{CollConversations, CollDocuments, CollWorldEvents} {
		if err := o.qdrant.EnsureCollection(ctx, name, dim); err != nil {
			return fmt.Errorf("init collection %s: %w", name, err)
		}
	}
	return nil
}

// RAGResult holds a single retrieval result.
type RAGResult struct {
	Content string
	Source  string
	Score   float32
}

// Query searches across all collections and returns merged results.
func (o *Orchestrator) Query(ctx context.Context, agentID, query string, topK int) ([]RAGResult, error) {
	vectors, err := o.embedder.Embed(ctx, []string{query})
	if err != nil {
		return nil, fmt.Errorf("embed query: %w", err)
	}
	if len(vectors) == 0 {
		return nil, nil
	}
	qvec := vectors[0]

	var allResults []RAGResult
	for _, coll := range []string{CollConversations, CollDocuments, CollWorldEvents} {
		hits, err := o.qdrant.Search(ctx, coll, qvec, uint64(topK))
		if err != nil {
			o.logger.Warn("rag search failed", zap.String("collection", coll), zap.Error(err))
			continue
		}
		for _, h := range hits {
			allResults = append(allResults, RAGResult{
				Content: h.Payload["content"],
				Source:  coll + ":" + h.ID,
				Score:   h.Score,
			})
		}
	}

	// Sort by score descending, take top-k overall
	sort.Slice(allResults, func(i, j int) bool {
		return allResults[i].Score > allResults[j].Score
	})
	if len(allResults) > topK {
		allResults = allResults[:topK]
	}
	return allResults, nil
}
```

**Step 2: Add Store method for indexing content**

Add to the same file:

```go
// Store indexes content into a specific collection.
func (o *Orchestrator) Store(ctx context.Context, collection, content string, metadata map[string]string) error {
	vectors, err := o.embedder.Embed(ctx, []string{content})
	if err != nil {
		return fmt.Errorf("embed content: %w", err)
	}
	if len(vectors) == 0 {
		return fmt.Errorf("empty embedding result")
	}

	id := uuid.New().String()
	payload := make(map[string]string)
	for k, v := range metadata {
		payload[k] = v
	}
	payload["content"] = content
	payload["indexed_at"] = time.Now().UTC().Format(time.RFC3339)

	return o.qdrant.Upsert(ctx, collection, id, vectors[0], payload)
}

// FormatContext formats RAG results as a context block for agent prompts.
func FormatContext(results []RAGResult) string {
	if len(results) == 0 {
		return ""
	}
	var b []byte
	b = append(b, "## Retrieved Context (RAG)\n\n"...)
	for i, r := range results {
		b = append(b, fmt.Sprintf("%d. [%s] (score: %.2f)\n%s\n\n", i+1, r.Source, r.Score, r.Content)...)
	}
	return string(b)
}
```

**Step 3: Integrate RAG into agent engine**

In `internal/agent/engine.go`, add a `rag *rag.Orchestrator` field to the `Engine` struct (line 22). Add `SetRAG(r *rag.Orchestrator)` setter.

In `Execute()` (line 119), after memory recall, add RAG retrieval:

```go
// RAG retrieval
var ragContext string
if e.rag != nil {
	ragResults, ragErr := e.rag.Query(ctx, agentID, userMsg, 5)
	if ragErr != nil {
		e.logger.Warn("RAG query failed", zap.Error(ragErr))
	} else {
		ragContext = rag.FormatContext(ragResults)
	}
}
```

Inject `ragContext` into the messages (append as a system message before user message if non-empty).

After agent execution completes, index the conversation:

```go
if e.rag != nil {
	go func() {
		storeCtx := context.Background()
		_ = e.rag.Store(storeCtx, rag.CollConversations, userMsg+"\n"+response, map[string]string{
			"agent_id": agentID,
			"role":     "conversation",
		})
	}()
}
```

**Step 4: Verify compilation**

Run: `go build ./...`
Expected: PASS.

**Step 5: Commit**

```bash
git add internal/rag/rag.go internal/agent/engine.go
git commit -m "feat(rag): add RAG orchestrator with query, store, and engine integration"
```

---

### Task 11: Config Additions — Embedding, Qdrant, Skills Directory

**Files:**
- Modify: `internal/config/config.go`
- Modify: `configs/nuka.json`
- Modify: `.env.example`

**Step 1: Add new config types**

In `internal/config/config.go`, add to the `Config` struct:

```go
type Config struct {
	Server    ServerConfig     `json:"server"`
	Providers []ProviderConfig `json:"providers"`
	Gateway   GatewayConfig    `json:"gateway"`
	MCP       MCPConfig        `json:"mcp"`
	Database  DatabaseConfig   `json:"database"`
	Embedding EmbeddingConfig  `json:"embedding"`
	SkillsDir string           `json:"skills_dir"`
}
```

Add new config types:

```go
type EmbeddingConfig struct {
	Provider  string `json:"provider"`  // "api" or "local"
	Endpoint  string `json:"endpoint"`
	Model     string `json:"model"`
	APIKey    string `json:"api_key"`
	Dimension int    `json:"dimension"`
}

type QdrantConfig struct {
	Host string `json:"host"`
	Port int    `json:"port"`
}
```

Add `Qdrant QdrantConfig` to `DatabaseConfig`:

```go
type DatabaseConfig struct {
	Postgres PostgresConfig `json:"postgres"`
	Neo4j    Neo4jConfig    `json:"neo4j"`
	Redis    RedisConfig    `json:"redis"`
	Qdrant   QdrantConfig   `json:"qdrant"`
}

type QdrantConfig struct {
	Host string `json:"host"`
	Port int    `json:"port"`
}
```

**Step 2: Update nuka.json**

Add after the `"database"` section:

```json
"embedding": {
  "provider": "api",
  "endpoint": "https://maas-api.cn-huabei-1.xf-yun.com/v2",
  "model": "text-embedding-v1",
  "api_key": "${XFYUN_API_KEY}",
  "dimension": 1024
},
"skills_dir": "skills"
```

Add inside `"database"`:

```json
"qdrant": {
  "host": "${QDRANT_HOST:localhost}",
  "port": 6334
}
```

**Step 3: Update .env.example**

Add:

```
# Qdrant
QDRANT_HOST=localhost
```

**Step 4: Verify compilation**

Run: `go build ./...`
Expected: PASS.

**Step 5: Commit**

```bash
git add internal/config/config.go configs/nuka.json .env.example
git commit -m "feat(config): add embedding, Qdrant, and skills_dir configuration"
```

---

### Task 12: /search Command & Main Wiring

**Files:**
- Create: `internal/command/search.go`
- Modify: `cmd/nuka/main.go`

**Step 1: Create /search command**

Create `internal/command/search.go`:

```go
package command

import (
	"context"
	"fmt"
	"strings"
)

// RAGSearcher abstracts RAG query capability.
type RAGSearcher interface {
	Query(ctx context.Context, agentID, query string, topK int) ([]RAGSearchResult, error)
}

// RAGSearchResult mirrors rag.RAGResult to avoid circular imports.
type RAGSearchResult struct {
	Content string
	Source  string
	Score   float32
}

// RegisterSearchCommand registers the /search command.
func RegisterSearchCommand(reg *Registry, searcher RAGSearcher) {
	reg.Register(&Command{
		Name:        "search",
		Description: "Search knowledge base via RAG",
		Usage:       "/search <query>",
		Handler: func(ctx context.Context, args string, cc *CommandContext) (*CommandResult, error) {
			if strings.TrimSpace(args) == "" {
				return &CommandResult{Content: "Usage: /search <query>"}, nil
			}
			results, err := searcher.Query(ctx, "", args, 5)
			if err != nil {
				return nil, fmt.Errorf("RAG search: %w", err)
			}
			if len(results) == 0 {
				return &CommandResult{Content: "No results found for: " + args}, nil
			}
			var sb strings.Builder
			sb.WriteString(fmt.Sprintf("Search results for \"%s\":\n\n", args))
			for i, r := range results {
				sb.WriteString(fmt.Sprintf("%d. [%.2f] %s\n   %s\n\n", i+1, r.Score, r.Source, r.Content))
			}
			return &CommandResult{Content: sb.String()}, nil
		},
	})
}
```

**Step 2: Wire everything in main.go**

In `cmd/nuka/main.go`, after engine creation and before gateway setup, add the full wiring sequence:

```go
// --- Command Registry ---
cmdRegistry := command.NewRegistry()

// --- Skill Manager ---
skillMgr := skill.NewManager()
if cfg.SkillsDir != "" {
	plugins, loadErr := skill.LoadFromDir(cfg.SkillsDir)
	if loadErr != nil {
		logger.Warn("failed to load plugin skills", zap.Error(loadErr))
	} else {
		for _, s := range plugins {
			skillMgr.Add(s)
		}
		logger.Info("Loaded plugin skills", zap.Int("count", len(plugins)))
	}
}
engine.SetSkillManager(skillMgr)

// --- Embedding + Qdrant + RAG ---
var ragOrch *rag.Orchestrator
if cfg.Embedding.Endpoint != "" {
	embCfg := embedding.Config{
		Provider:  cfg.Embedding.Provider,
		Endpoint:  cfg.Embedding.Endpoint,
		Model:     cfg.Embedding.Model,
		APIKey:    cfg.Embedding.APIKey,
		Dimension: cfg.Embedding.Dimension,
	}
	var embedder embedding.Provider
	switch cfg.Embedding.Provider {
	case "local":
		embedder = embedding.NewLocalProvider(embCfg)
	default:
		embedder = embedding.NewAPIProvider(embCfg)
	}

	if cfg.Database.Qdrant.Host != "" {
		qdrantCfg := vectorstore.QdrantConfig{
			Host: cfg.Database.Qdrant.Host,
			Port: cfg.Database.Qdrant.Port,
		}
		qClient, qErr := vectorstore.NewClient(qdrantCfg)
		if qErr != nil {
			logger.Warn("Qdrant unavailable, running without RAG", zap.Error(qErr))
		} else {
			ragOrch = rag.NewOrchestrator(embedder, qClient, logger)
			if initErr := ragOrch.InitCollections(context.Background()); initErr != nil {
				logger.Warn("RAG collection init failed", zap.Error(initErr))
			}
			engine.SetRAG(ragOrch)
			logger.Info("RAG initialized")
		}
	}
}

// --- Register commands ---
command.RegisterBuiltins(cmdRegistry, engine, mcpClients, gw, skillMgr)
command.RegisterCreateCommands(cmdRegistry, engine, pgStore, skillMgr)
if ragOrch != nil {
	command.RegisterSearchCommand(cmdRegistry, ragOrch)
}
```

Update the `msgrouter.New()` call to pass `cmdRegistry`.

**Step 3: Verify compilation**

Run: `go build ./...`
Expected: PASS.

**Step 4: Commit**

```bash
git add internal/command/search.go cmd/nuka/main.go
git commit -m "feat(command): add /search command and wire all new subsystems in main"
```

---

### Task 13: Built-in Skills — Web Search, Memory Recall, Task Planning, World Observer

**Files:**
- Create: `internal/skill/builtin.go`

**Step 1: Create built-in skill definitions**

Create `internal/skill/builtin.go` with `RegisterBuiltins(mgr *Manager)` that adds:

```go
package skill

// RegisterBuiltins adds the default built-in skills to the manager.
func RegisterBuiltins(mgr *Manager) {
	builtins := []*Skill{
		{
			ID:          "web_search",
			Name:        "web_search",
			Description: "Search the web for current information",
			PromptFragment: "You have the ability to search the web for current information. " +
				"Use the web search tool when the user asks about recent events, current data, " +
				"or anything that requires up-to-date information beyond your training data.",
			ToolNames: []string{"mcp:web-search:search"},
			Source:    "builtin",
		},
		{
			ID:          "memory_recall",
			Name:        "memory_recall",
			Description: "Deep memory search via RAG",
			PromptFragment: "You have access to a deep memory system powered by RAG. " +
				"Use rag_search to find relevant past conversations, documents, and world events. " +
				"Use rag_store to save important information for future recall.",
			ToolNames: []string{"rag_search", "rag_store"},
			Source:    "builtin",
		},
		{
			ID:          "task_planning",
			Name:        "task_planning",
			Description: "Break down complex tasks into actionable steps",
			PromptFragment: "You can break down complex tasks into steps and create schedules. " +
				"Use create_schedule to set up recurring or one-time tasks. " +
				"Use send_message to coordinate with other agents.",
			ToolNames: []string{"create_schedule", "send_message"},
			Source:    "builtin",
		},
		{
			ID:          "world_observer",
			Name:        "world_observer",
			Description: "Monitor and interact with world simulation events",
			PromptFragment: "You can observe the world simulation state, including time, " +
				"weather, agent activities, and scheduled events. Use get_world_state " +
				"to check current conditions and get_schedules to see upcoming events.",
			ToolNames: []string{"get_world_state", "get_schedules"},
			Source:    "builtin",
		},
	}
	for _, s := range builtins {
		mgr.Add(s)
	}
}
```

**Step 2: Wire built-in skills in main.go**

In `cmd/nuka/main.go`, after creating `skillMgr`, call:

```go
skill.RegisterBuiltins(skillMgr)
```

Auto-assign `web_search` and `world_observer` to the default "world" agent:

```go
skillMgr.AssignSkill("world", "web_search")
skillMgr.AssignSkill("world", "world_observer")
skillMgr.AssignSkill("world", "memory_recall")
```

**Step 3: Verify compilation**

Run: `go build ./...`
Expected: PASS.

**Step 4: Commit**

```bash
git add internal/skill/builtin.go cmd/nuka/main.go
git commit -m "feat(skill): add built-in skills and auto-assign to world agent"
```

---

### Task 14: Unit & Integration Tests

**Files:**
- Create: `internal/command/command_test.go`
- Create: `internal/skill/skill_test.go`
- Create: `internal/embedding/embedding_test.go`

**Step 1: Command registry unit tests**

Create `internal/command/command_test.go`:

```go
package command

import (
	"context"
	"testing"
)

func TestRegistryDispatch(t *testing.T) {
	reg := NewRegistry()
	reg.Register(&Command{
		Name:        "ping",
		Description: "Ping test",
		Usage:       "/ping",
		Handler: func(ctx context.Context, args string, cc *CommandContext) (*CommandResult, error) {
			return &CommandResult{Content: "pong: " + args}, nil
		},
	})

	ctx := context.Background()
	cc := &CommandContext{Platform: "test"}

	// Test known command
	result, err := reg.Dispatch(ctx, "/ping hello", cc)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Content != "pong: hello" {
		t.Errorf("got %q, want %q", result.Content, "pong: hello")
	}

	// Test unknown command
	result, err = reg.Dispatch(ctx, "/unknown", cc)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Content == "" {
		t.Error("expected error message for unknown command")
	}
}

func TestRegistryList(t *testing.T) {
	reg := NewRegistry()
	reg.Register(&Command{Name: "beta"})
	reg.Register(&Command{Name: "alpha"})

	list := reg.List()
	if len(list) != 2 {
		t.Fatalf("got %d commands, want 2", len(list))
	}
	if list[0].Name != "alpha" {
		t.Errorf("got %q first, want %q", list[0].Name, "alpha")
	}
}
```

**Step 2: Skill manager unit tests**

Create `internal/skill/skill_test.go`:

```go
package skill

import "testing"

func TestManagerAssignAndGet(t *testing.T) {
	mgr := NewManager()
	mgr.Add(&Skill{ID: "s1", Name: "search", Source: "builtin"})
	mgr.Add(&Skill{ID: "s2", Name: "memory", Source: "builtin"})

	mgr.AssignSkill("agent-1", "s1")
	mgr.AssignSkill("agent-1", "s2")
	mgr.AssignSkill("agent-2", "s1")

	skills := mgr.GetAgentSkills("agent-1")
	if len(skills) != 2 {
		t.Fatalf("agent-1 got %d skills, want 2", len(skills))
	}

	skills = mgr.GetAgentSkills("agent-2")
	if len(skills) != 1 {
		t.Fatalf("agent-2 got %d skills, want 1", len(skills))
	}

	skills = mgr.GetAgentSkills("agent-3")
	if len(skills) != 0 {
		t.Fatalf("agent-3 got %d skills, want 0", len(skills))
	}
}

func TestManagerUnassign(t *testing.T) {
	mgr := NewManager()
	mgr.Add(&Skill{ID: "s1", Name: "search", Source: "builtin"})

	mgr.AssignSkill("agent-1", "s1")
	mgr.UnassignSkill("agent-1", "s1")

	skills := mgr.GetAgentSkills("agent-1")
	if len(skills) != 0 {
		t.Fatalf("got %d skills after unassign, want 0", len(skills))
	}
}

func TestFormatSkillPrompt(t *testing.T) {
	mgr := NewManager()
	skills := []*Skill{
		{Name: "search", PromptFragment: "You can search."},
	}
	prompt := mgr.FormatSkillPrompt(skills)
	if prompt == "" {
		t.Error("expected non-empty prompt")
	}
}
```

**Step 3: Embedding provider mock test**

Create `internal/embedding/embedding_test.go`:

```go
package embedding

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestAPIProviderEmbed(t *testing.T) {
	// Mock OpenAI-compatible embedding server
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		resp := embeddingResponse{
			Data: []struct {
				Embedding []float32 `json:"embedding"`
			}{
				{Embedding: []float32{0.1, 0.2, 0.3}},
			},
		}
		json.NewEncoder(w).Encode(resp)
	}))
	defer srv.Close()

	p := NewAPIProvider(Config{
		Endpoint: srv.URL,
		Model:    "test-model",
	})

	vectors, err := p.Embed(context.Background(), []string{"hello"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(vectors) != 1 {
		t.Fatalf("got %d vectors, want 1", len(vectors))
	}
	if len(vectors[0]) != 3 {
		t.Fatalf("got dimension %d, want 3", len(vectors[0]))
	}
	if p.Dimension() != 3 {
		t.Errorf("got dimension %d, want 3", p.Dimension())
	}
}
```

**Step 4: Run all tests**

Run: `go test ./internal/command/... ./internal/skill/... ./internal/embedding/... -v`
Expected: ALL PASS.

**Step 5: Commit**

```bash
git add internal/command/command_test.go internal/skill/skill_test.go internal/embedding/embedding_test.go
git commit -m "test: add unit tests for command registry, skill manager, and embedding provider"
```

---

### Task 15: LLM-in-the-Loop Smoke Tests

**Files:**
- Create: `internal/e2e/smoke_test.go`
- Create: `.env.test`

**Step 1: Create test environment config**

Create `.env.test`:

```
PORT=3211
CONFIG_PATH=configs/nuka.json
XFYUN_API_KEY=${XFYUN_API_KEY}
DEFAULT_PROVIDER_ID=xfyun
DEFAULT_MODEL=xminimaxm25
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=nukaworld
DATABASE_URL=postgres://nuka:nukaworld@localhost:5432/nukaworld_test?sslmode=disable
QDRANT_HOST=localhost
```

**Step 2: Create LLM-in-the-loop smoke test suite**

Create `internal/e2e/smoke_test.go`:

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
	// Wait for server to be ready
	for i := 0; i < 30; i++ {
		resp, err := http.Get(baseURL + "/api/health")
		if err == nil && resp.StatusCode == 200 {
			break
		}
		time.Sleep(1 * time.Second)
	}
	os.Exit(m.Run())
}

func sendMessage(t *testing.T, content string) string {
	t.Helper()
	body, _ := json.Marshal(map[string]string{
		"content":    content,
		"channel_id": "test-e2e",
		"user_id":    "tester",
		"user_name":  "E2E Tester",
	})
	resp, err := http.Post(baseURL+"/api/chat", "application/json", bytes.NewReader(body))
	if err != nil {
		t.Fatalf("send message failed: %v", err)
	}
	defer resp.Body.Close()
	data, _ := io.ReadAll(resp.Body)
	return string(data)
}

func TestSlashHelp(t *testing.T) {
	reply := sendMessage(t, "/help")
	if !strings.Contains(reply, "/help") {
		t.Errorf("expected /help in response, got: %s", reply)
	}
}

func TestSlashAgents(t *testing.T) {
	reply := sendMessage(t, "/agents")
	if !strings.Contains(strings.ToLower(reply), "world") {
		t.Errorf("expected 'world' agent in response, got: %s", reply)
	}
}

func TestSlashSkills(t *testing.T) {
	reply := sendMessage(t, "/skills")
	if reply == "" {
		t.Error("expected non-empty skills response")
	}
}

func TestSlashStatus(t *testing.T) {
	reply := sendMessage(t, "/status")
	if reply == "" {
		t.Error("expected non-empty status response")
	}
}

func TestCreateAgent(t *testing.T) {
	reply := sendMessage(t, "/create_agent 一个喜欢讲笑话的助手")
	if !strings.Contains(reply, "created") && !strings.Contains(reply, "创建") {
		t.Errorf("expected creation confirmation, got: %s", reply)
	}
}

func TestPlainMessage(t *testing.T) {
	reply := sendMessage(t, "你好，请介绍一下你自己")
	if len(reply) < 10 {
		t.Errorf("expected meaningful response, got: %s", reply)
	}
}

func TestSearchCommand(t *testing.T) {
	reply := sendMessage(t, "/search Nuka World")
	// May return "No results" if RAG is empty, but should not error
	if strings.Contains(reply, "error") || strings.Contains(reply, "Error") {
		t.Errorf("unexpected error in search response: %s", reply)
	}
}
```

**Step 3: Run smoke tests**

Requires a running Nuka server. Start the server first, then run:

```bash
NUKA_BASE_URL=http://localhost:3210 go test -tags=e2e ./internal/e2e/... -v -timeout 120s
```

Expected: ALL PASS (some tests may be skipped if RAG/Qdrant not available).

**Step 4: Commit**

```bash
git add internal/e2e/smoke_test.go .env.test
git commit -m "test(e2e): add LLM-in-the-loop smoke tests for slash commands and chat"
```

---

## Summary

| Task | Component | New Files | Modified Files |
|------|-----------|-----------|----------------|
| 1 | Command Registry | `internal/command/command.go` | — |
| 2 | Built-in Commands | `internal/command/builtin.go` | — |
| 3 | Router Integration | — | `internal/router/router.go`, `cmd/nuka/main.go` |
| 4 | Skill System | `internal/skill/skill.go`, `loader.go`, `manager.go` | — |
| 5 | Skill DB Schema | `migrations/002_skills.up.sql` | `internal/store/store.go` |
| 6 | Skills → Engine | — | `internal/agent/engine.go`, `internal/agent/tools.go`, `cmd/nuka/main.go` |
| 7 | Create Commands | `internal/command/create.go` | — |
| 8 | Embedding Provider | `internal/embedding/embedding.go`, `api.go`, `local.go` | — |
| 9 | Qdrant Integration | `internal/vectorstore/qdrant.go` | `docker-compose.yml` |
| 10 | RAG Orchestrator | `internal/rag/rag.go` | `internal/agent/engine.go` |
| 11 | Config Additions | — | `internal/config/config.go`, `configs/nuka.json`, `.env.example` |
| 12 | /search + Wiring | `internal/command/search.go` | `cmd/nuka/main.go` |
| 13 | Built-in Skills | `internal/skill/builtin.go` | `cmd/nuka/main.go` |
| 14 | Unit Tests | `internal/command/command_test.go`, `internal/skill/skill_test.go`, `internal/embedding/embedding_test.go` | — |
| 15 | E2E Smoke Tests | `internal/e2e/smoke_test.go`, `.env.test` | — |

**New Go dependencies:** `github.com/qdrant/go-client`, `google.golang.org/grpc`

**New Docker services:** Qdrant (ports 6333/6334)
