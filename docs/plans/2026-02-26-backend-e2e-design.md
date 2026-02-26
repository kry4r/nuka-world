# Nuka World — 后端全流程闭环设计文档

> 日期: 2026-02-26 | 方案: Bottom-Up（地基优先）

## 1. 目标

实现 Slack 端到端闭环：用户在 Slack 发消息 → 世界管家/居民处理 → 回复到 Slack。

闭环包含：基础对话、记忆系统参与、Team 协作、数据持久化、讯飞修复、Web Search MCP 集成。

## 2. 关键断点分析

| # | 断点 | 影响 |
|---|------|------|
| 1 | `gw.SetHandler()` 未调用 | Gateway 收到 Slack 消息后无处路由 |
| 2 | 无持久化层 | Agent/Provider/Session 重启即丢 |
| 3 | 讯飞 `path_model` 配置错误 | 讯飞 API 调用失败 |
| 4 | web_search 工具缺失 | Agent 无法搜索 |
| 5 | Gateway → Engine 响应回路缺失 | 处理结果无法回到 Slack |
| 6 | 无配置文件系统 | Provider/Gateway token 管理困难 |

## 3. Layer 1 — JSON 配置文件系统

新增 `internal/config/` 包，配置文件路径 `configs/nuka.json`。

**结构：**

```json
{
  "server": { "port": 8080, "log_level": "debug" },
  "providers": [
    {
      "id": "openai", "type": "openai", "name": "OpenAI",
      "endpoint": "https://api.openai.com/v1",
      "api_key": "${OPENAI_API_KEY}",
      "models": ["gpt-4o", "gpt-4o-mini"]
    },
    {
      "id": "anthropic", "type": "anthropic", "name": "Anthropic",
      "endpoint": "https://api.anthropic.com/v1",
      "api_key": "${ANTHROPIC_API_KEY}"
    },
    {
      "id": "xfyun", "type": "openai", "name": "讯飞星辰MaaS",
      "endpoint": "https://maas-api.cn-huabei-1.xf-yun.com/v2",
      "api_key": "${XFYUN_API_KEY}"
    }
  ],
  "gateway": {
    "slack": { "enabled": true, "bot_token": "${SLACK_BOT_TOKEN}", "app_token": "${SLACK_APP_TOKEN}" },
    "discord": { "enabled": false, "bot_token": "${DISCORD_BOT_TOKEN}" }
  },
  "mcp": {
    "servers": [
      { "name": "web-search", "type": "sse", "url": "http://localhost:3001/sse", "description": "open-webSearch MCP" }
    ]
  },
  "database": {
    "postgres": { "dsn": "${DATABASE_URL:postgres://nuka:nuka@localhost:5432/nukaworld}" },
    "neo4j": { "uri": "${NEO4J_URI:bolt://localhost:7687}", "user": "${NEO4J_USER:neo4j}", "password": "${NEO4J_PASSWORD}" },
    "redis": { "url": "${REDIS_URL:redis://localhost:6379}" }
  }
}
```

**要点：**
- `${VAR}` 引用环境变量，`${VAR:default}` 支持默认值
- `main.go` 启动时加载配置，替代散落的 `os.Getenv` 调用
- Provider 列表从配置初始化，不再硬编码

## 4. Layer 2 — PostgreSQL 持久化层

新增 `internal/store/` 包，基于 `database/sql` + `lib/pq`。

**迁移文件 `migrations/001_init.sql`：**

```sql
CREATE TABLE IF NOT EXISTS agents (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    role        TEXT,
    personality TEXT,
    backstory   TEXT,
    system_prompt TEXT,
    provider_id TEXT,
    model       TEXT,
    status      TEXT DEFAULT 'idle',
    created_at  TIMESTAMPTZ DEFAULT now(),
    updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
    id         TEXT PRIMARY KEY,
    agent_id   TEXT REFERENCES agents(id),
    channel    TEXT,
    platform   TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS messages (
    id         BIGSERIAL PRIMARY KEY,
    session_id TEXT REFERENCES sessions(id),
    role       TEXT NOT NULL,
    content    TEXT,
    tool_calls JSONB,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS providers (
    id       TEXT PRIMARY KEY,
    name     TEXT NOT NULL,
    type     TEXT NOT NULL,
    endpoint TEXT,
    config   JSONB,
    created_at TIMESTAMPTZ DEFAULT now()
);
```

**接口设计：**

```go
// internal/store/store.go
type Store struct { db *sql.DB }

type AgentStore interface {
    Save(ctx context.Context, a *agent.Agent) error
    Get(ctx context.Context, id string) (*agent.Agent, error)
    List(ctx context.Context) ([]*agent.Agent, error)
    Delete(ctx context.Context, id string) error
}

type SessionStore interface {
    Create(ctx context.Context, agentID, channel, platform string) (string, error)
    AppendMessage(ctx context.Context, sessionID string, msg provider.Message) error
    GetMessages(ctx context.Context, sessionID string, limit int) ([]provider.Message, error)
}
```

**要点：**
- `main.go` 启动时运行迁移，Engine 从 DB 加载已有 Agent
- Session 按 `(agent_id, channel, platform)` 唯一，对话历史持久化
- API handler 的 providers/skills/adapters 也迁移到 DB，不再内存 slice

## 5. Layer 3 — 讯飞星辰 MaaS 修复

**根因：** 讯飞 MaaS API 是标准 OpenAI 兼容格式，模型名放在请求 body 的 `model` 字段中。当前代码中 `path_model: true` 会把模型名嵌入 URL 路径，导致 PathDomainError。

**修复方案：**

1. 讯飞配置中移除 `path_model`，使用标准 endpoint：
   ```
   endpoint: https://maas-api.cn-huabei-1.xf-yun.com/v2
   ```
   最终请求 URL：`https://maas-api.cn-huabei-1.xf-yun.com/v2/chat/completions`

2. 在 `openai.go` 的 `chatURL()` 中增加 `url_template` 支持，应对其他非标准 API：
   ```go
   func (p *OpenAIProvider) chatURL(model string) string {
       if tpl := p.config.Extra["url_template"]; tpl != "" {
           return strings.ReplaceAll(tpl, "{model}", model)
       }
       if p.config.Extra["path_model"] == "true" && model != "" {
           return p.config.Endpoint + "/" + model + "/chat/completions"
       }
       return p.config.Endpoint + "/chat/completions"
   }
   ```

3. 讯飞认证使用 `Authorization: Bearer <api_key>` 标准头，与 OpenAI 一致，无需额外处理。

**验证：** 启动后向讯飞 Provider 发送测试请求，确认 200 响应。

## 6. Layer 4 — Web Search MCP 集成

新增 `internal/mcp/` 包，实现 MCP SSE 客户端，对接 [open-webSearch](https://github.com/Aas-ee/open-webSearch)。

**架构：**

```
open-webSearch MCP Server (localhost:3001)
    ↑ SSE
internal/mcp/Client
    ↑ CallTool("web_search", {query: "..."})
internal/agent/builtin_tools.go  (替换占位实现)
```

**MCPClient 接口：**

```go
// internal/mcp/client.go
type Client struct {
    name     string
    url      string       // SSE endpoint
    tools    []ToolInfo   // 从 MCP 服务器发现的工具列表
    logger   *zap.Logger
}

func (c *Client) Connect(ctx context.Context) error          // SSE 握手 + 工具发现
func (c *Client) CallTool(ctx context.Context, name string, args map[string]interface{}) (string, error)
func (c *Client) ListTools() []ToolInfo
func (c *Client) Close() error
```

**集成步骤：**

1. `main.go` 从配置读取 `mcp.servers`，为每个 server 创建 `mcp.Client` 并 `Connect`
2. 将 MCP 工具注册到 Engine 的 `ToolRegistry`，替换 `web_search` 占位实现
3. Agent 调用 `web_search` 时，实际通过 MCPClient → SSE → open-webSearch 执行

**MCP SSE 协议要点：**
- 连接 `GET /sse`，接收 `endpoint` 事件获取 JSON-RPC 端点
- 通过 `POST` 到该端点发送 `tools/list` 和 `tools/call` 请求
- 响应通过 SSE 流返回，按 `id` 匹配请求

## 7. Layer 5 — Slack 端到端接线

核心问题：`main.go` 中 `gw.SetHandler()` 从未调用，Gateway 收到消息后无处路由。

**新增 `internal/router/` 包 — MessageRouter：**

```go
// internal/router/router.go
type MessageRouter struct {
    engine  *agent.Engine
    gw      *gateway.Gateway
    steward *orchestrator.Steward
    store   *store.Store       // 持久化
    logger  *zap.Logger
}

func (mr *MessageRouter) Handle(ctx context.Context, msg *gateway.InboundMessage) {
    // 1. 查找或创建 session
    sessionID := mr.store.FindOrCreateSession(ctx, msg.AgentID, msg.ChannelID, msg.Platform)

    // 2. 持久化用户消息
    mr.store.AppendMessage(ctx, sessionID, provider.Message{Role: "user", Content: msg.Text})

    // 3. 调用 Engine.Execute
    result, err := mr.engine.Execute(ctx, msg.AgentID, msg.Text)
    if err != nil {
        mr.handleError(ctx, msg, err)
        return
    }

    // 4. 持久化 assistant 回复
    mr.store.AppendMessage(ctx, sessionID, provider.Message{Role: "assistant", Content: result.Content})

    // 5. 通过 Gateway 回复到原平台
    mr.gw.Send(ctx, &gateway.OutboundMessage{
        Platform:  msg.Platform,
        ChannelID: msg.ChannelID,
        AgentID:   msg.AgentID,
        Text:      result.Content,
        ThreadTS:  msg.ThreadTS,
    })
}
```

**main.go 接线修改：**

```go
// 创建 MessageRouter
msgRouter := router.NewMessageRouter(engine, gw, steward, pgStore, logger)

// 关键一行：将 handler 注入 Gateway
gw.SetHandler(msgRouter.Handle)
```

**消息流：**

```
Slack 用户发消息
  → SlackAdapter.handleSlackMessage()
    → Gateway.handler (= MessageRouter.Handle)
      → Engine.Execute (记忆召回 → LLM → 工具循环)
        → Gateway.Send → SlackAdapter.Send
          → Slack 用户收到回复
```

**Agent 路由逻辑：**
- 如果消息中 `@提及` 了某个 Agent 名称，路由到该 Agent
- 如果频道绑定了默认 Agent，路由到默认 Agent
- 否则路由到「世界管家」（Steward），由管家决定分配

## 8. Layer 6 — Team 协作经由 Slack

当 MessageRouter 判断消息应由 Team 处理时，走 Steward 编排路径。

**流程：**

```
Slack 消息 "@team-research 帮我调研 X"
  → MessageRouter.Handle
    → 识别 @team-research → 路由到 Steward
      → Steward.Handle(teamID, message)
        → 分解子任务 → Scheduler 分配给成员 Agent
          → 各 Agent 并行 Execute
        → Steward 聚合结果
      → MessageRouter 将聚合结果回复到 Slack
```

**关键修改：**

1. `MessageRouter.Handle` 增加 Team 路由分支：
   ```go
   if teamID := mr.resolveTeam(msg); teamID != "" {
       result, err := mr.steward.Handle(ctx, teamID, msg.Text)
       // ... 回复到 Slack
       return
   }
   ```

2. Steward 聚合结果格式化为 Slack 友好的 markdown：
   - 每个子任务结果用 `>` 引用块
   - 标注执行 Agent 名称
   - 末尾附加 Steward 总结

3. 长任务支持：Steward 先回复「正在处理...」，完成后再发送最终结果。

## 9. 实现顺序总结

| 顺序 | Layer | 内容 | 依赖 |
|------|-------|------|------|
| 1 | Config | `internal/config/` + `configs/nuka.json` | 无 |
| 2 | 持久化 | `internal/store/` + `migrations/` | Config |
| 3 | 讯飞修复 | `openai.go` chatURL 修改 | Config |
| 4 | MCP | `internal/mcp/` + web_search 替换 | Config |
| 5 | Slack 接线 | `internal/router/` + main.go 修改 | 持久化 |
| 6 | Team 协作 | MessageRouter Team 分支 | Slack 接线 |

每层完成后可独立验证，逐步构建到完整闭环。
