# Nuka World Enhancement Design: Slash Commands, Skills, RAG & Testing

**Date:** 2026-02-26
**Status:** Approved

## Goal

Extend Nuka World with slash commands across all platforms, a plugin-style skill system, Qdrant-backed RAG for memory enhancement, and LLM-in-the-loop testing.

## Architecture Overview

```
User message
  ↓
Router (internal/router)
  ├── "/" prefix → Command Registry (new: internal/command/)
  │     ├── /agents, /mcp, /skills, /status, /help
  │     ├── /create_agent, /create_skill, /create_team, /create_schedule
  │     └── /search → RAG Orchestrator
  └── "@" or plain → Agent Engine (existing)
        ├── Skill-aware prompt building (skills injected per agent)
        ├── RAG context injection (Qdrant + Neo4j hybrid)
        └── Tool execution (built-in + MCP + skill-bound)
```

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Slash command scope | All platforms (REST, Slack, Discord, CLI) | Unified experience |
| Command naming | Underscore-separated (`/create_agent`) | Clear, consistent |
| Vector database | Qdrant | Go SDK mature, Docker-friendly, best ANN perf |
| Embedding | Hybrid (remote API + local, switchable) | Flexibility |
| RAG content | Conversations + Documents + World events | Core use cases |
| Skill loading | Plugin dir + DB + Built-in (3-layer) | Extensible like Claude Code |
| Testing | Unit + Integration + LLM-in-the-loop | Real conversation verification |

---

## Section 1: Slash Command Framework

### New Package: `internal/command/`

**Command interface:**

```go
type Command struct {
    Name        string
    Description string
    Usage       string
    Handler     func(ctx context.Context, args string, cc *CommandContext) (*CommandResult, error)
}

type CommandContext struct {
    Platform  string
    ChannelID string
    UserID    string
    UserName  string
    Engine    *agent.Engine
    RAG       *rag.Orchestrator
    // ... other dependencies
}

type CommandResult struct {
    Content string
    Data    interface{} // structured data for rich formatting
}
```

**Registry** holds all commands, dispatches by name, returns help for unknown commands.

### Command List

| Command | Description |
|---------|-------------|
| `/agents` | List all registered agents with status |
| `/mcp` | List connected MCP servers and their tools |
| `/skills` | List all skills (built-in + plugin + DB) |
| `/status` | Gateway adapter connection status |
| `/create_agent <description>` | Create agent from natural language |
| `/create_team <name> <agent_ids>` | Create a team |
| `/create_skill <agent_id> <description>` | Add skill to agent |
| `/create_schedule <agent_id> <spec>` | Create scheduled task |
| `/search <query>` | RAG search across all collections |
| `/help` | List available commands |

### Router Integration

In `internal/router/router.go`, the `Handle` method checks for `/` prefix before agent resolution:

```go
if strings.HasPrefix(msg.Content, "/") {
    return r.commandRegistry.Dispatch(ctx, msg)
}
// ... existing agent routing
```

---

## Section 2: Skills & Tools System

### Skill Model

```go
type Skill struct {
    ID              string            `json:"id"`
    Name            string            `json:"name"`
    Description     string            `json:"description"`
    PromptFragment  string            `json:"prompt_fragment"`
    ToolNames       []string          `json:"tool_names"`
    Source          string            `json:"source"` // "builtin", "plugin", "db"
}
```

Each agent has its own set of assigned skills. Skills are per-agent, not global.

### Three-Layer Loading

1. **Built-in** — hardcoded in Go, always available
2. **Plugin directory** — loaded from `skills/` folder on startup
3. **Database** — created via `/create_skill`, stored in PostgreSQL

**Priority:** Plugin dir > Database > Built-in (same name = override)

### Plugin Directory Structure

```
skills/
  web_search/
    skill.json
    prompt.md       # optional, overrides prompt_fragment in skill.json
  memory_recall/
    skill.json
    prompt.md
```

**skill.json format:**

```json
{
  "name": "web_search",
  "description": "Search the web for current information",
  "prompt_fragment": "You have the ability to search the web...",
  "tools": ["mcp:web-search:search"],
  "auto_assign": ["world"]
}
```

### Built-in Skills

| Skill | Description | Tools |
|-------|-------------|-------|
| `web_search` | Web search via MCP | MCP web-search tools |
| `memory_recall` | Deep memory search via RAG | `rag_search`, `rag_store` |
| `task_planning` | Break down tasks into steps | `create_schedule`, `send_message` |
| `world_observer` | Monitor world events | `get_world_state`, `get_schedules` |

### Prompt Injection

In `engine.buildMessages()`, after persona prompt, inject assigned skills:

```go
if skills := e.skillManager.GetAgentSkills(agentID); len(skills) > 0 {
    msgs = append(msgs, provider.Message{
        Role:    "system",
        Content: formatSkillPrompt(skills),
    })
}
```

### Database Schema

```sql
CREATE TABLE IF NOT EXISTS skills (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    prompt_fragment TEXT,
    tool_names  JSONB,
    source      VARCHAR(20) DEFAULT 'db',
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agent_skills (
    agent_id  VARCHAR(100) NOT NULL,
    skill_id  UUID REFERENCES skills(id),
    PRIMARY KEY (agent_id, skill_id)
);
```

---

## Section 3: RAG Integration

### New Packages

- `internal/embedding/` — Embedding provider abstraction
- `internal/vectorstore/` — Qdrant client wrapper
- `internal/rag/` — RAG orchestrator (combines vector + graph)

### Embedding Provider

```go
type EmbeddingProvider interface {
    Embed(ctx context.Context, texts []string) ([][]float32, error)
    Dimension() int
}
```

**Implementations:**
- `APIEmbedding` — calls OpenAI-compatible `/v1/embeddings` endpoint
- `LocalEmbedding` — calls local model server (Ollama, etc.)

**Config:**

```json
"embedding": {
  "provider": "api",
  "endpoint": "https://maas-api.cn-huabei-1.xf-yun.com/v2",
  "model": "text-embedding-v1",
  "api_key": "${XFYUN_API_KEY}"
}
```

### Qdrant Collections

| Collection | Source | Indexed When |
|------------|--------|-------------|
| `conversations` | Agent responses + thinking chains | After each agent execution |
| `documents` | User uploads, knowledge base | Via API or `/upload` command |
| `world_events` | World clock events, schedules | On world event emission |

**Vector metadata:** `agent_id`, `timestamp`, `source_type`, `content_preview`

### RAG Query Flow

1. Embed user query via embedding provider
2. Search Qdrant across relevant collections (top-k per collection)
3. Parallel: spreading activation in Neo4j (existing memory system)
4. Merge & deduplicate results by relevance score
5. Format as context block for agent prompt

### Integration with Agent Engine

In `engine.Execute()`, after memory recall (step 1), add RAG retrieval:

```go
// Step 1.5: RAG retrieval
if e.rag != nil {
    ragBlocks, err := e.rag.Query(ctx, agentID, userMsg)
    // merge with memoryContext
}
```

### Docker Compose Addition

```yaml
qdrant:
  image: qdrant/qdrant:latest
  ports:
    - "6333:6333"
    - "6334:6334"
  volumes:
    - qdrant_data:/qdrant/storage
```

---

## Section 4: Testing Strategy

### Three Layers

| Layer | Scope | Infrastructure |
|-------|-------|---------------|
| Unit | Command parsing, skill loading, embedding mock | Go test, no external deps |
| Integration | Qdrant ops, skill DB, command dispatch | testcontainers-go |
| LLM-in-the-loop | Full conversation with real LLM | Running Nuka server |

### LLM-in-the-loop Tests

A test suite (`internal/e2e/` or `cmd/test-chat/`) that runs against a live Nuka deployment:

- Send `/agents` → verify agent list returned
- Send `/mcp` → verify MCP server list
- Send `/create_agent 一个喜欢讲笑话的助手` → verify agent created
- Send `/skills` → verify skill list includes built-in skills
- Send `/search <query>` → verify RAG results returned
- Send plain message → verify agent responds with RAG context
- Send message to skill-equipped agent → verify skill tools available

### Test Config

Tests use a separate `.env.test` with test-specific credentials and a dedicated Qdrant collection prefix to avoid polluting production data.

---

## Implementation Order

1. **Slash Command Framework** — `internal/command/` + router integration
2. **Skill System** — `internal/skill/` + DB schema + plugin loader
3. **Embedding Provider** — `internal/embedding/` + config
4. **Qdrant Integration** — `internal/vectorstore/` + Docker
5. **RAG Orchestrator** — `internal/rag/` + engine integration
6. **Built-in Skills** — wire skills to tools
7. **LLM-in-the-loop Tests** — smoke test suite
8. **Unit & Integration Tests** — per-component tests

## Dependencies

**New Go packages:**
- `github.com/qdrant/go-client` — Qdrant gRPC client
- `google.golang.org/grpc` — gRPC (Qdrant dependency)

**New Docker services:**
- Qdrant (port 6333/6334)

**Config additions:**
- `embedding` section in `nuka.json`
- `skills_dir` path in config
- Qdrant connection settings in `database` section
