# Nuka World — 后端全流程闭环实现计划

> 基于设计文档: `2026-02-26-backend-e2e-design.md`
> 方案: Bottom-Up | 共 6 Layer, 约 20 个任务

## 注意事项

- 每个任务完成后运行 `go build ./...` 确认编译通过
- 每个 Layer 完成后运行 `go test ./...` 确认无回归
- 涉及新包时先创建目录和基础文件，再逐步填充
- InboundMessage 字段名是 `Content`（非 `Text`），OutboundMessage 同理
- MessageHandler 签名是 `func(msg *InboundMessage)`（无 context 参数）
- 现有迁移 `001_init.up.sql` 使用 UUID 主键，代码中 Agent ID 也是 UUID string

---

## Layer 1 — JSON 配置文件系统

### Task 1.1: 创建 `internal/config/config.go`

**新建文件** `internal/config/config.go`

定义配置结构体：

```go
package config

type Config struct {
    Server    ServerConfig              `json:"server"`
    Providers []ProviderConfig          `json:"providers"`
    Gateway   GatewayConfig             `json:"gateway"`
    MCP       MCPConfig                 `json:"mcp"`
    Database  DatabaseConfig            `json:"database"`
}

type ServerConfig struct {
    Port     int    `json:"port"`
    LogLevel string `json:"log_level"`
}

type ProviderConfig struct {
    ID       string            `json:"id"`
    Type     string            `json:"type"`
    Name     string            `json:"name"`
    Endpoint string            `json:"endpoint"`
    APIKey   string            `json:"api_key"`
    Models   []string          `json:"models,omitempty"`
    Extra    map[string]string `json:"extra,omitempty"`
}

type GatewayConfig struct {
    Slack   SlackGatewayConfig   `json:"slack"`
    Discord DiscordGatewayConfig `json:"discord"`
}

type SlackGatewayConfig struct {
    Enabled  bool   `json:"enabled"`
    BotToken string `json:"bot_token"`
    AppToken string `json:"app_token"`
}

type DiscordGatewayConfig struct {
    Enabled  bool   `json:"enabled"`
    BotToken string `json:"bot_token"`
}

type MCPConfig struct {
    Servers []MCPServerConfig `json:"servers"`
}

type MCPServerConfig struct {
    Name        string `json:"name"`
    Type        string `json:"type"`
    URL         string `json:"url"`
    Description string `json:"description"`
}

type DatabaseConfig struct {
    Postgres PostgresConfig `json:"postgres"`
    Neo4j    Neo4jConfig    `json:"neo4j"`
    Redis    RedisConfig    `json:"redis"`
}

type PostgresConfig struct {
    DSN string `json:"dsn"`
}

type Neo4jConfig struct {
    URI      string `json:"uri"`
    User     string `json:"user"`
    Password string `json:"password"`
}

type RedisConfig struct {
    URL string `json:"url"`
}
```

实现 `Load(path string) (*Config, error)`：
1. 读取 JSON 文件
2. 用正则 `\$\{(\w+)(?::([^}]*))?\}` 替换环境变量引用
3. 未设置且无默认值的变量保留空字符串

**验证:** `go build ./internal/config/`

### Task 1.2: 创建 `configs/nuka.json`

**新建文件** `configs/nuka.json`，内容按设计文档 Section 3 的 JSON 结构。

所有敏感值使用 `${ENV_VAR}` 引用，数据库连接串使用 `${VAR:default}` 提供本地默认值。

### Task 1.3: 重构 `cmd/nuka/main.go` 使用配置

**修改文件** `cmd/nuka/main.go`

1. 启动时调用 `config.Load("configs/nuka.json")`（支持 `CONFIG_PATH` 环境变量覆盖路径）
2. 删除 `setupProviders()` 函数，改为遍历 `cfg.Providers` 创建 Provider
3. Gateway 初始化改为读取 `cfg.Gateway.Slack.Enabled` 等字段
4. 数据库连接串从 `cfg.Database` 读取
5. 保留 `godotenv.Load()` 兼容 `.env` 文件

**验证:** `go build ./cmd/nuka/ && go test ./...`

---

## Layer 2 — PostgreSQL 持久化层

### Task 2.1: 更新迁移文件 `migrations/001_init.up.sql`

**修改文件** `migrations/001_init.up.sql`

现有迁移已有 `providers`, `agents`, `teams`, `sessions`, `messages` 五张表。需补充：

1. `agents` 表增加 `backstory TEXT` 列（Persona 需要）
2. `sessions` 表增加 `UNIQUE(agent_id, platform, channel_id)` 约束（FindOrCreate 需要）
3. `messages` 表增加 `tool_calls JSONB` 列（工具调用记录）

使用 `CREATE TABLE IF NOT EXISTS` + `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` 保持幂等。

### Task 2.2: 创建 `internal/store/store.go`

**新建文件** `internal/store/store.go`

```go
package store

type Store struct {
    db     *pgxpool.Pool
    logger *zap.Logger
}

func New(dsn string, logger *zap.Logger) (*Store, error)  // 创建连接池
func (s *Store) Migrate(ctx context.Context) error         // 读取并执行 migrations/
func (s *Store) Close()
```

`Migrate` 方法读取 `migrations/` 目录下的 `.sql` 文件按文件名排序执行。简单实现，不引入额外迁移库。

### Task 2.3: 创建 `internal/store/agents.go`

**新建文件** `internal/store/agents.go`

实现 Agent 的 CRUD：

```go
func (s *Store) SaveAgent(ctx context.Context, a *agent.Agent) error
func (s *Store) GetAgent(ctx context.Context, id string) (*agent.Agent, error)
func (s *Store) ListAgents(ctx context.Context) ([]*agent.Agent, error)
func (s *Store) DeleteAgent(ctx context.Context, id string) error
```

- `SaveAgent` 使用 `INSERT ... ON CONFLICT (id) DO UPDATE` 实现 upsert
- 字段映射: Persona.ID → id, Persona.Name → name, 等等
- `ListAgents` 返回所有 status != 'deleted' 的 Agent

### Task 2.4: 创建 `internal/store/sessions.go`

**新建文件** `internal/store/sessions.go`

```go
func (s *Store) FindOrCreateSession(ctx context.Context, agentID, channelID, platform string) (string, error)
func (s *Store) AppendMessage(ctx context.Context, sessionID string, msg provider.Message) error
func (s *Store) GetMessages(ctx context.Context, sessionID string, limit int) ([]provider.Message, error)
```

- `FindOrCreateSession` 使用 `INSERT ... ON CONFLICT (agent_id, platform, channel_id) DO UPDATE SET status='active' RETURNING id`
- `AppendMessage` 将 `tool_calls` 序列化为 JSONB
- `GetMessages` 按 `created_at ASC` 排序，limit 默认 50

### Task 2.5: 集成 Store 到 `main.go` 和 Engine

**修改文件** `cmd/nuka/main.go`

1. 从 `cfg.Database.Postgres.DSN` 创建 `store.New()`
2. 调用 `pgStore.Migrate(ctx)` 运行迁移
3. 启动时调用 `pgStore.ListAgents()` 加载已有 Agent 到 Engine

**修改文件** `internal/agent/engine.go`

1. Engine 新增 `store *store.Store` 字段（可选，nil 时退化为纯内存）
2. `Register()` 中同时调用 `store.SaveAgent()` 持久化

**验证:** `go build ./... && go test ./...`

---

## Layer 3 — 讯飞星辰 MaaS 修复

### Task 3.1: 修改 `internal/provider/openai.go` chatURL

**修改文件** `internal/provider/openai.go`

在 `chatURL()` 方法开头增加 `url_template` 支持：

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

需要在文件顶部 import `"strings"`（如果尚未导入）。

### Task 3.2: 配置驱动的 Provider 初始化

**修改文件** `cmd/nuka/main.go`

删除 `setupProviders()` 函数，替换为遍历 `cfg.Providers`：

```go
for _, pc := range cfg.Providers {
    provCfg := provider.ProviderConfig{
        ID: pc.ID, Type: pc.Type, Name: pc.Name,
        Endpoint: pc.Endpoint, APIKey: pc.APIKey,
        Models: pc.Models, Extra: pc.Extra,
    }
    switch pc.Type {
    case "openai":
        router.Register(provider.NewOpenAIProvider(provCfg, logger))
    case "anthropic":
        router.Register(provider.NewAnthropicProvider(provCfg, logger))
    }
}
```

讯飞配置在 `configs/nuka.json` 中 type 为 `"openai"`，endpoint 为 `https://maas-api.cn-huabei-1.xf-yun.com/v2`，无需 `path_model`。

**验证:** `go build ./cmd/nuka/`

---

## Layer 4 — Web Search MCP 集成

### Task 4.1: 创建 `internal/mcp/client.go`

**新建文件** `internal/mcp/client.go`

实现 MCP SSE 客户端核心：

```go
package mcp

type Client struct {
    name       string
    sseURL     string          // e.g. "http://localhost:3001/sse"
    rpcURL     string          // 从 SSE endpoint 事件中获取
    tools      []ToolInfo
    pending    map[int]chan json.RawMessage
    nextID     int
    mu         sync.Mutex
    logger     *zap.Logger
}

type ToolInfo struct {
    Name        string                 `json:"name"`
    Description string                 `json:"description"`
    InputSchema map[string]interface{} `json:"inputSchema"`
}

func NewClient(name, sseURL string, logger *zap.Logger) *Client
func (c *Client) Connect(ctx context.Context) error
func (c *Client) CallTool(ctx context.Context, name string, args map[string]interface{}) (string, error)
func (c *Client) ListTools() []ToolInfo
func (c *Client) Close() error
```

`Connect` 流程：
1. `GET /sse` 建立 SSE 连接
2. 接收 `event: endpoint` 获取 JSON-RPC POST 地址
3. 启动后台 goroutine 持续读取 SSE 事件，按 `id` 分发到 pending channels
4. 发送 `tools/list` 请求，填充 `tools` 列表

`CallTool` 流程：
1. 构造 JSON-RPC 请求 `{method: "tools/call", params: {name, arguments}, id}`
2. POST 到 `rpcURL`
3. 等待 SSE 事件中对应 `id` 的响应
4. 解析 `result.content[0].text` 返回

**验证:** `go build ./internal/mcp/`

### Task 4.2: 注册 MCP 工具到 Engine

**修改文件** `internal/agent/builtin_tools.go`

新增函数，将 MCP 工具桥接到 ToolRegistry：

```go
func RegisterMCPTools(reg *ToolRegistry, clients []*mcp.Client) {
    for _, c := range clients {
        for _, tool := range c.ListTools() {
            client := c // capture
            t := tool   // capture
            reg.Register(provider.Tool{
                Type: "function",
                Function: provider.ToolFunction{
                    Name:        t.Name,
                    Description: t.Description,
                    Parameters:  t.InputSchema,
                },
            }, func(ctx context.Context, args string) (string, error) {
                var parsed map[string]interface{}
                json.Unmarshal([]byte(args), &parsed)
                return client.CallTool(ctx, t.Name, parsed)
            })
        }
    }
}
```

### Task 4.3: 集成 MCP 到 main.go

**修改文件** `cmd/nuka/main.go`

在 Engine 创建之后、Gateway 启动之前：

```go
var mcpClients []*mcp.Client
for _, sc := range cfg.MCP.Servers {
    c := mcp.NewClient(sc.Name, sc.URL, logger)
    if err := c.Connect(ctx); err != nil {
        logger.Warn("MCP server unavailable", zap.String("name", sc.Name), zap.Error(err))
        continue
    }
    mcpClients = append(mcpClients, c)
}
agent.RegisterMCPTools(engine.Tools(), mcpClients)
```

graceful shutdown 中增加 MCP client 关闭。

**验证:** `go build ./cmd/nuka/`

---

## Layer 5 — Slack 端到端接线

### Task 5.1: 创建 `internal/router/router.go`

**新建文件** `internal/router/router.go`

```go
package router

type MessageRouter struct {
    engine  *agent.Engine
    gw      *gateway.Gateway
    steward *orchestrator.Steward
    store   *store.Store
    logger  *zap.Logger
}

func New(engine *agent.Engine, gw *gateway.Gateway,
    steward *orchestrator.Steward, store *store.Store,
    logger *zap.Logger) *MessageRouter
```

核心方法签名必须匹配 `gateway.MessageHandler`（无 context）：

```go
func (mr *MessageRouter) Handle(msg *gateway.InboundMessage)
```

**验证:** `go build ./internal/router/`

### Task 5.2: 实现 MessageRouter.Handle 核心逻辑

**修改文件** `internal/router/router.go`

`Handle` 方法内部流程：

1. 创建 `ctx := context.Background()`
2. 解析 Agent 路由：`resolveAgent(msg)` — 从消息内容中匹配 `@AgentName`，或使用频道默认 Agent
3. 如果找不到 Agent，回复错误提示到原频道
4. 如果 Store 非 nil，调用 `store.FindOrCreateSession()` + `store.AppendMessage()`
5. 调用 `engine.Execute(ctx, agentID, msg.Content)`
6. 如果 Store 非 nil，持久化 assistant 回复
7. 调用 `gw.Send()` 回复到原平台

`resolveAgent` 逻辑：
- 遍历 `engine.List()`，检查 `msg.Content` 是否包含 `@` + agent.Persona.Name
- 匹配到则返回该 Agent ID，并从 Content 中去掉 `@Name` 前缀
- 未匹配则返回空字符串（后续由 Team 路由或默认 Agent 处理）

### Task 5.3: 接线 main.go — 调用 `gw.SetHandler`

**修改文件** `cmd/nuka/main.go`

在 Gateway 创建之后、`gw.ConnectAll()` 之前插入：

```go
msgRouter := router.New(engine, gw, steward, pgStore, logger)
gw.SetHandler(msgRouter.Handle)
```

这是修复断点 #1 和 #5 的关键一行。

同时确保 `gw.SetHandler` 在 `gw.Register(slackAdapter)` 之前调用，因为 `Register` 内部会将 handler 传递给 adapter。

**验证:** `go build ./cmd/nuka/ && go test ./...`

---

## Layer 6 — Team 协作经由 Slack

### Task 6.1: MessageRouter 增加 Team 路由

**修改文件** `internal/router/router.go`

在 `Handle` 方法中，Agent 路由之前增加 Team 路由分支：

```go
func (mr *MessageRouter) Handle(msg *gateway.InboundMessage) {
    ctx := context.Background()

    // 1. 尝试 Team 路由
    if teamID := mr.resolveTeam(msg); teamID != "" && mr.steward != nil {
        mr.handleTeam(ctx, msg, teamID)
        return
    }

    // 2. Agent 路由（已有逻辑）
    // ...
}
```

`resolveTeam` 逻辑：
- 检查 `msg.Content` 是否包含 `@team-<name>` 模式
- 匹配到则在 Steward 的 team 列表中查找对应 Team ID

### Task 6.2: 实现 handleTeam 方法

**修改文件** `internal/router/router.go`

```go
func (mr *MessageRouter) handleTeam(ctx context.Context, msg *gateway.InboundMessage, teamID string) {
    // 1. 先发送「正在处理...」占位消息
    mr.gw.Send(ctx, &gateway.OutboundMessage{
        Platform:  msg.Platform,
        ChannelID: msg.ChannelID,
        Content:   "🤔 团队正在协作处理，请稍候...",
        ReplyTo:   msg.ReplyTo,
    })

    // 2. 调用 Steward.Handle
    result, err := mr.steward.Handle(ctx, teamID, msg.Content)
    if err != nil {
        mr.sendError(ctx, msg, err)
        return
    }

    // 3. 格式化结果为 Slack 友好格式
    formatted := mr.formatTeamResult(result)

    // 4. 回复最终结果
    mr.gw.Send(ctx, &gateway.OutboundMessage{
        Platform:  msg.Platform,
        ChannelID: msg.ChannelID,
        Content:   formatted,
        ReplyTo:   msg.ReplyTo,
    })
}
```

`formatTeamResult` 将 `StewardResult` 格式化：
- 每个子任务用 `> **AgentName**: result` 引用块
- 末尾附加 Steward 的 Summary

### Task 6.3: Steward 暴露 Team 列表查询

**修改文件** `internal/orchestrator/steward.go`

确认 `Steward` 已有 `ListTeams()` 方法（已存在）。新增按名称查找：

```go
func (s *Steward) FindTeamByName(name string) (*Team, bool)
```

供 `MessageRouter.resolveTeam` 调用。

**验证:** `go build ./... && go test ./...`

---

## 端到端验证清单

每个 Layer 完成后按以下步骤验证：

| Layer | 验证方式 |
|-------|---------|
| 1 Config | `go build ./...` 编译通过，`main.go` 能读取 `configs/nuka.json` |
| 2 持久化 | `docker compose up -d postgres` → 启动服务 → 检查表已创建 → 创建 Agent → 重启后 Agent 仍在 |
| 3 讯飞 | 配置讯飞 API Key → 创建使用讯飞的 Agent → `/api/agents/{id}/chat` 返回正常响应 |
| 4 MCP | 启动 open-webSearch → 启动服务 → Agent 对话中触发 `web_search` → 返回搜索结果 |
| 5 Slack | 配置 Slack Token → 启动服务 → 在 Slack 中 @bot 发消息 → 收到 Agent 回复 |
| 6 Team | 创建 Team → 在 Slack 中 @team-name 发消息 → 收到聚合回复 |
