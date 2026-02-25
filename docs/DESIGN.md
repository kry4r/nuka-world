# Nuka World — AI Agent 世界系统设计文档

> 版本: 0.1.0 | 日期: 2026-02-24

## 1. 项目概述

Nuka World 是一个基于 Go 语言的 AI Agent 世界系统。每个 Agent 是世界中的「居民」，拥有像素风拟人化形象、独立记忆、日程安排和社交关系。系统原生支持多 Agent 并行协作，通过图式认知记忆系统模拟人类思考链路，并提供多平台 Gateway 接入能力。

### 1.1 核心理念

- **世界观**: Agent 不是冷冰冰的工具，而是 Nuka World 的居民，有性格、有记忆、有成长
- **认知模型**: 借鉴 Piaget 图式理论 + Collins & Loftus 扩散激活网络，实现类人思考
- **透明性**: 完整展示思维链与工具调用链，让用户理解 Agent 的决策过程
- **开放性**: 全 Provider 兼容，支持云端/本地/自定义 LLM 端点

### 1.2 设计参考

| 项目 | 借鉴点 |
|------|--------|
| SwarmClaw | 多平台 Gateway 架构、Agent 工具系统、Session 管理 |
| MemOS | 图式记忆存储、记忆检索与更新机制 |
| CrewAI | 角色驱动的 Agent Team 编排模式 |
| Claude Code | 上下文压缩与优化策略、思维链展示 |
| ZeroClaw | 多 Provider 路由、Rust 高性能思路（Go 实现） |
| langchaingo | Go LLM 生态集成 |

## 2. 系统架构

### 2.1 整体架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                        Nuka World                               │
│                                                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │  Frontend    │  │  Gateway    │  │  Admin REST API         │ │
│  │  Next.js     │  │  Adapter    │  │  (Go net/http)          │ │
│  │  + Pixel UI  │  │  Layer      │  │                         │ │
│  └──────┬───────┘  └──────┬──────┘  └───────────┬─────────────┘ │
│         │                 │                      │               │
│  ┌──────┴─────────────────┴──────────────────────┴─────────────┐│
│  │                   Core API Gateway (Go)                      ││
│  │              gRPC (内部) + REST (外部)                        ││
│  └──┬──────────┬──────────┬──────────┬──────────┬──────────────┘│
│     │          │          │          │          │               │
│  ┌──┴───┐  ┌──┴───┐  ┌──┴───┐  ┌──┴───┐  ┌──┴────────────┐  │
│  │Agent │  │Memory│  │Orch. │  │Ctx   │  │World          │  │
│  │Engine│  │System│  │Engine│  │Mgr   │  │Simulation     │  │
│  └──┬───┘  └──┬───┘  └──┬───┘  └──┬───┘  └──┬────────────┘  │
│     │         │         │         │          │               │
│  ┌──┴───┐  ┌──┴───┐  ┌──┴───┐  ┌──┴───┐  ┌──┴───┐          │
│  │LLM   │  │Neo4j │  │Task  │  │Token │  │State │          │
│  │Router│  │Graph │  │Queue │  │Budget│  │Store │          │
│  └──────┘  └──────┘  └──────┘  └──────┘  └──────┘          │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 技术栈

| 层级 | 技术选型 | 说明 |
|------|----------|------|
| 后端语言 | Go 1.22+ | goroutine 原生并发，适合多 Agent 并行 |
| API 框架 | net/http + chi router | 轻量 REST；内部服务间用 gRPC |
| 前端框架 | Next.js 15 + React 19 | SSR + 像素风 UI |
| 样式 | Tailwind CSS v4 | 配合像素风主题 token |
| 图数据库 | Neo4j 5.x | 图式记忆存储，Cypher 查询 |
| 关系数据库 | PostgreSQL 16 | Agent 配置、Session、任务等结构化数据 |
| 缓存 | Redis 7 | Session 状态、消息队列、分布式锁 |
| 消息队列 | Redis Streams / NATS | Agent 间通信、事件总线 |
| 容器化 | Docker + Docker Compose | 开发/部署一致性 |

### 2.3 Go 项目结构

```
nuka-world/
├── cmd/
│   └── nuka/              # 主入口
│       └── main.go
├── internal/
│   ├── agent/             # Agent 引擎
│   │   ├── engine.go      # Agent 执行循环
│   │   ├── persona.go     # 居民人格定义
│   │   ├── tools.go       # 工具注册与调用
│   │   └── thinking.go    # 思维链追踪
│   ├── memory/            # 图式记忆系统
│   │   ├── schema.go      # 图式定义与操作
│   │   ├── activation.go  # 扩散激活引擎
│   │   ├── assimilation.go# 同化（匹配已有图式）
│   │   ├── accommodation.go# 顺应（更新图式结构）
│   │   └── store.go       # Neo4j 存储层
│   ├── orchestrator/      # 编排引擎
│   │   ├── team.go        # Agent Team 定义
│   │   ├── role.go        # 角色与职责
│   │   ├── task.go        # 任务分配与追踪
│   │   └── scheduler.go   # 并行调度器
│   ├── context/           # 上下文管理
│   │   ├── manager.go     # 上下文窗口管理
│   │   ├── compactor.go   # 上下文压缩
│   │   └── budget.go      # Token 预算控制
│   ├── provider/          # LLM Provider 路由
│   │   ├── router.go      # 多 Provider 路由
│   │   ├── anthropic.go   # Claude API
│   │   ├── openai.go      # OpenAI API
│   │   ├── ollama.go      # Ollama 本地
│   │   └── custom.go      # 自定义 OpenAI-compatible
│   ├── gateway/           # 多平台 Gateway
│   │   ├── manager.go     # Gateway 管理器
│   │   ├── slack.go       # Slack 适配器
│   │   ├── telegram.go    # Telegram 适配器
│   │   ├── discord.go     # Discord 适配器
│   │   ├── feishu.go      # 飞书适配器
│   │   └── broadcast.go   # 世界广播系统
│   ├── world/             # 世界模拟
│   │   ├── simulation.go  # 世界时钟与事件
│   │   ├── schedule.go    # 居民日程系统
│   │   ├── relation.go    # 社交关系图
│   │   └── growth.go      # 记忆成长追踪
│   └── api/               # HTTP/gRPC API
│       ├── handler.go
│       ├── middleware.go
│       └── websocket.go   # 实时推送
├── web/                   # Next.js 前端
│   ├── src/
│   │   ├── app/
│   │   ├── components/
│   │   │   ├── world/     # 世界地图与居民
│   │   │   ├── agent/     # Agent 卡片与详情
│   │   │   ├── thinking/  # 思维链可视化
│   │   │   └── chat/      # 对话界面
│   │   └── lib/
│   └── public/
│       └── sprites/       # 像素风素材
├── configs/               # 配置文件
├── migrations/            # 数据库迁移
├── docs/                  # 文档
├── docker-compose.yml
├── go.mod
└── go.sum
```

## 3. 核心模块设计

### 3.1 Agent 引擎 (internal/agent)

Agent 是 Nuka World 的核心实体——世界中的「居民」。

#### 3.1.1 Agent 生命周期

```
创建 → 初始化人格 → 待命
                      ↓
              接收任务/消息
                      ↓
         ┌─── 记忆激活（扩散激活）
         │           ↓
         │    图式匹配（同化/顺应）
         │           ↓
         │    构建上下文（注入记忆）
         │           ↓
         │    LLM 推理（思维链）
         │           ↓
         │    工具调用（如需要）
         │           ↓
         │    输出响应
         │           ↓
         └─── 更新记忆图 → 待命
```

#### 3.1.2 居民人格模型 (Persona)

```go
type Persona struct {
    ID          string            `json:"id"`
    Name        string            `json:"name"`        // 居民名称
    Role        string            `json:"role"`        // 职责角色
    Personality string            `json:"personality"` // 性格描述
    Sprite      SpriteConfig      `json:"sprite"`      // 像素风形象配置
    Skills      []string          `json:"skills"`      // 技能标签
    Traits      map[string]float64`json:"traits"`      // 性格特质值 (0-1)
    Backstory   string            `json:"backstory"`   // 背景故事
    SystemPrompt string           `json:"system_prompt"`// 系统提示词
}

type SpriteConfig struct {
    BaseSprite  string `json:"base_sprite"`  // 基础像素图
    IdleAnim    string `json:"idle_anim"`    // 待机动画
    WorkAnim    string `json:"work_anim"`    // 工作动画
    ThinkAnim   string `json:"think_anim"`   // 思考动画
    Palette     string `json:"palette"`      // 调色板主题
}
```

#### 3.1.3 思维链追踪 (Thinking Chain)

每次 Agent 执行都会生成完整的思维链记录，前端可实时展示。

```go
type ThinkingChain struct {
    ID        string        `json:"id"`
    AgentID   string        `json:"agent_id"`
    SessionID string        `json:"session_id"`
    Steps     []ThinkStep   `json:"steps"`
    StartedAt time.Time     `json:"started_at"`
    Duration  time.Duration `json:"duration"`
}

type ThinkStep struct {
    Type      StepType    `json:"type"`      // memory_recall | schema_match | reasoning | tool_call | response
    Content   string      `json:"content"`   // 步骤内容描述
    Detail    interface{} `json:"detail"`    // 类型特定的详细数据
    Timestamp time.Time   `json:"timestamp"`
    TokensUsed int        `json:"tokens_used"`
}

type StepType string
const (
    StepMemoryRecall  StepType = "memory_recall"   // 记忆激活
    StepSchemaMatch   StepType = "schema_match"     // 图式匹配
    StepSchemaUpdate  StepType = "schema_update"    // 图式更新
    StepReasoning     StepType = "reasoning"        // LLM 推理
    StepToolCall      StepType = "tool_call"        // 工具调用
    StepToolResult    StepType = "tool_result"      // 工具返回
    StepResponse      StepType = "response"         // 最终响应
)
```

#### 3.1.4 主Agent — 世界管家 (World Steward)

Nuka World 有一个特殊的主 Agent，称为「世界管家」(World Steward)。它是所有外部消息的入口，负责理解用户意图、分发任务给合适的居民、协调 Team 协作、播报世界广播。

```
用户消息 → Gateway → 世界管家
                        ↓
                  意图识别 & 任务拆解
                        ↓
              ┌─────────┼─────────┐
              ↓         ↓         ↓
          居民 A    居民 B    居民 C
          (研究)    (编码)    (测试)
              ↓         ↓         ↓
              └─────────┼─────────┘
                        ↓
                  结果汇总 & 广播
                        ↓
                  世界管家 → 用户
```

**世界管家职责：**
- 接收所有外部平台消息（Slack/Telegram/Discord/飞书）
- 意图识别与任务拆解
- 根据居民角色和技能分配任务
- 监控任务执行进度
- 汇总结果并回复用户
- 发布世界广播（重要事件通知所有平台）
- 管理居民的日程冲突

### 3.2 图式记忆系统 (internal/memory)

这是 Nuka World 的认知核心，借鉴 Piaget 图式理论与 Collins & Loftus 扩散激活网络。

#### 3.2.1 记忆图结构 (Neo4j)

```
节点类型 (Node Labels):
  (:Schema)      — 图式节点，代表一个认知结构
  (:Memory)      — 具体记忆事件
  (:Concept)     — 抽象概念
  (:Entity)      — 实体（人、物、地点）
  (:Emotion)     — 情感标记

关系类型 (Relationships):
  -[:CONTAINS]->     Schema 包含子 Schema
  -[:ACTIVATES]->    激活关联（带权重）
  -[:INSTANCE_OF]->  Memory 是某 Schema 的实例
  -[:RELATED_TO]->   语义关联
  -[:TRIGGERED_BY]-> 触发关系
  -[:FELT]->         情感关联
```

#### 3.2.2 认知循环：激活 → 匹配 → 更新

```
输入（用户消息/任务）
        ↓
  ① 扩散激活 (Spreading Activation)
     从输入关键词出发，沿关系边扩散
     每跳衰减 decay_factor=0.7
     激活值超过阈值 threshold=0.3 的节点被召回
        ↓
  ② 图式匹配 (Schema Matching)
     将召回的记忆与已有图式对比
     计算匹配度 similarity_score
        ↓
  ③ 同化或顺应 (Assimilation / Accommodation)
     if 匹配度 > 0.8 → 同化：新信息归入已有图式
     if 匹配度 < 0.3 → 顺应：创建新图式或重构已有图式
     else             → 部分同化 + 微调图式
        ↓
  ④ 上下文注入 (Context Injection)
     将激活的记忆按相关性排序
     注入 LLM 上下文窗口（受 token 预算约束）
        ↓
  ⑤ 记忆更新 (Memory Update)
     LLM 响应后，提取新知识
     更新图式权重、创建新记忆节点
     强化或弱化关系边权重
```

#### 3.2.3 核心接口

```go
// MemorySystem 图式记忆系统主接口
type MemorySystem interface {
    // 扩散激活：从关键词出发，召回相关记忆
    Activate(ctx context.Context, agentID string, triggers []string, opts ActivationOpts) (*ActivationResult, error)

    // 图式匹配：将新信息与已有图式对比
    MatchSchema(ctx context.Context, agentID string, input string, activated *ActivationResult) (*SchemaMatchResult, error)

    // 同化：新信息归入已有图式
    Assimilate(ctx context.Context, agentID string, schemaID string, memory *Memory) error

    // 顺应：创建或重构图式
    Accommodate(ctx context.Context, agentID string, input string, memories []*Memory) (*Schema, error)

    // 构建上下文：将激活记忆注入 LLM 上下文
    BuildContext(ctx context.Context, agentID string, activated *ActivationResult, budget int) ([]Message, error)

    // 更新记忆：从 LLM 响应中提取并存储新知识
    UpdateFromResponse(ctx context.Context, agentID string, response string, chain *ThinkingChain) error
}

type ActivationOpts struct {
    MaxDepth     int     // 最大扩散跳数，默认 3
    DecayFactor  float64 // 衰减因子，默认 0.7
    Threshold    float64 // 激活阈值，默认 0.3
    MaxNodes     int     // 最大召回节点数，默认 50
}

type ActivationResult struct {
    Nodes    []ActivatedNode // 被激活的节点
    Paths    [][]string      // 激活路径
    Duration time.Duration
}
```

### 3.3 编排引擎 (internal/orchestrator)

角色驱动型编排，世界管家作为顶层调度者。

#### 3.3.1 Team 定义

```go
type Team struct {
    ID          string   `json:"id"`
    Name        string   `json:"name"`
    StewardID   string   `json:"steward_id"`  // 世界管家 Agent ID
    Members     []Member `json:"members"`
    Workflow    Workflow  `json:"workflow"`     // 执行流程
}

type Member struct {
    AgentID     string   `json:"agent_id"`
    Role        string   `json:"role"`         // 在 Team 中的角色
    CanDelegate bool     `json:"can_delegate"` // 是否可转派任务
    Priority    int      `json:"priority"`     // 调度优先级
}

type Workflow struct {
    Type  WorkflowType `json:"type"`  // sequential | parallel | conditional
    Steps []Step       `json:"steps"`
}

type WorkflowType string
const (
    WorkflowSequential  WorkflowType = "sequential"
    WorkflowParallel    WorkflowType = "parallel"
    WorkflowConditional WorkflowType = "conditional"
)
```

#### 3.3.2 并行调度

```go
// Scheduler 管理多 Agent 并行执行
type Scheduler struct {
    pool     *ants.Pool          // goroutine 池
    tasks    chan *TaskExecution
    results  chan *TaskResult
    mu       sync.RWMutex
    running  map[string]*TaskExecution
}

// 核心调度逻辑：世界管家拆解任务后并行分发
func (s *Scheduler) Dispatch(team *Team, tasks []*Task) <-chan *TaskResult {
    results := make(chan *TaskResult, len(tasks))
    var wg sync.WaitGroup

    for _, task := range tasks {
        agent := s.matchAgent(team, task) // 按角色匹配居民
        wg.Add(1)
        s.pool.Submit(func() {
            defer wg.Done()
            result := agent.Execute(task)
            results <- result
        })
    }

    go func() { wg.Wait(); close(results) }()
    return results
}
```

### 3.4 上下文管理 (internal/context)

借鉴 Claude Code 的上下文优化策略。

#### 3.4.1 Token 预算控制

```go
type ContextManager struct {
    maxTokens    int            // 模型最大上下文窗口
    reserveRatio float64        // 为响应预留的比例 (默认 0.3)
    compactor    *Compactor
}

type ContextWindow struct {
    SystemPrompt  []Message  // 系统提示 (固定)
    PersonaBlock  []Message  // 居民人格 (固定)
    MemoryBlock   []Message  // 激活记忆 (动态，按相关性排序)
    HistoryBlock  []Message  // 对话历史 (可压缩)
    TaskBlock     []Message  // 当前任务 (固定)
    ToolResults   []Message  // 工具返回 (可截断)
}
```

#### 3.4.2 压缩策略

```
优先级从高到低（压缩时从低优先级开始裁剪）：

1. SystemPrompt + PersonaBlock  — 永不压缩
2. TaskBlock                    — 永不压缩
3. MemoryBlock                  — 按相关性截断尾部
4. ToolResults                  — 保留摘要，丢弃原始输出
5. HistoryBlock                 — 旧消息摘要化

压缩触发条件：
  当前 token 总量 > maxTokens * (1 - reserveRatio)

压缩方式：
  - 对话历史：用 LLM 生成摘要替换旧轮次
  - 工具结果：提取关键信息，丢弃冗余
  - 记忆块：降低激活阈值，减少注入量
```

### 3.5 多平台 Gateway (internal/gateway)

统一消息入口，所有平台消息归一化后交给世界管家处理。

#### 3.5.1 适配器接口

```go
type GatewayAdapter interface {
    // 平台标识
    Platform() string

    // 启动连接
    Connect(ctx context.Context) error

    // 发送消息到平台
    Send(ctx context.Context, msg *OutboundMessage) error

    // 接收消息（内部转为统一格式）
    OnMessage(handler MessageHandler)

    // 广播消息到所有已连接频道
    Broadcast(ctx context.Context, msg *BroadcastMessage) error

    // 关闭连接
    Close() error
}

type MessageHandler func(msg *InboundMessage)

type InboundMessage struct {
    Platform  string    `json:"platform"`
    ChannelID string    `json:"channel_id"`
    UserID    string    `json:"user_id"`
    UserName  string    `json:"user_name"`
    Content   string    `json:"content"`
    Timestamp time.Time `json:"timestamp"`
    ReplyTo   string    `json:"reply_to,omitempty"`
}
```

#### 3.5.2 世界广播系统

世界管家可向所有已连接平台同时发送广播消息。

```go
type BroadcastMessage struct {
    Type      BroadcastType `json:"type"`
    Title     string        `json:"title"`
    Content   string        `json:"content"`
    AgentID   string        `json:"agent_id"`   // 发起广播的居民
    Priority  int           `json:"priority"`    // 0=普通 1=重要 2=紧急
    Platforms []string      `json:"platforms"`   // 空=全平台
}

type BroadcastType string
const (
    BroadcastAnnouncement BroadcastType = "announcement" // 公告
    BroadcastTaskComplete BroadcastType = "task_complete" // 任务完成
    BroadcastWorldEvent   BroadcastType = "world_event"   // 世界事件
    BroadcastDailyDigest  BroadcastType = "daily_digest"  // 每日摘要
)
```

### 3.6 世界模拟 (internal/world)

Nuka World 不只是 Agent 管理面板，居民在世界中有日程、关系和成长轨迹。

#### 3.6.1 世界时钟

```go
type WorldClock struct {
    ticker    *time.Ticker
    listeners []ClockListener
    speed     float64  // 时间倍率，1.0=实时
}

// 每个世界 tick 触发居民日程检查、记忆衰减、关系更新
type ClockListener interface {
    OnTick(worldTime time.Time)
}
```

#### 3.6.2 居民日程

```go
type Schedule struct {
    AgentID   string          `json:"agent_id"`
    Entries   []ScheduleEntry `json:"entries"`
}

type ScheduleEntry struct {
    ID        string        `json:"id"`
    Type      ActivityType  `json:"type"`
    Title     string        `json:"title"`
    StartTime time.Time     `json:"start_time"`
    Duration  time.Duration `json:"duration"`
    Recurring string        `json:"recurring,omitempty"` // cron 表达式
    Status    string        `json:"status"`              // pending|active|done
}

type ActivityType string
const (
    ActivityWork    ActivityType = "work"     // 执行任务
    ActivityReview  ActivityType = "review"   // 回顾记忆
    ActivitySocial  ActivityType = "social"   // 与其他居民交流
    ActivityRest    ActivityType = "rest"     // 休息（降低负载）
    ActivityLearn   ActivityType = "learn"    // 学习新技能
)
```

#### 3.6.3 社交关系图

居民之间的关系存储在 Neo4j 中，与记忆图共享同一数据库。

```go
type Relation struct {
    FromAgentID string       `json:"from_agent_id"`
    ToAgentID   string       `json:"to_agent_id"`
    Type        RelationType `json:"type"`
    Strength    float64      `json:"strength"`    // 0-1 关系强度
    History     []string     `json:"history"`     // 交互历史摘要
    UpdatedAt   time.Time    `json:"updated_at"`
}

type RelationType string
const (
    RelationColleague  RelationType = "colleague"   // 同事
    RelationMentor     RelationType = "mentor"      // 导师
    RelationSubordinate RelationType = "subordinate" // 下属
    RelationFriend     RelationType = "friend"      // 朋友
)
```

#### 3.6.4 记忆成长追踪

每个居民有成长指标，随交互和学习自然增长。

```go
type GrowthProfile struct {
    AgentID       string             `json:"agent_id"`
    Level         int                `json:"level"`          // 成长等级
    Experience    int                `json:"experience"`     // 经验值
    SchemaCount   int                `json:"schema_count"`   // 图式数量
    MemoryCount   int                `json:"memory_count"`   // 记忆数量
    SkillScores   map[string]float64 `json:"skill_scores"`   // 各技能熟练度
    MilestoneLog  []Milestone        `json:"milestones"`     // 成长里程碑
}

type Milestone struct {
    Title     string    `json:"title"`
    Desc      string    `json:"description"`
    AchievedAt time.Time `json:"achieved_at"`
}
```

### 3.7 LLM Provider 路由 (internal/provider)

全 Provider 兼容架构，每个居民可绑定不同的 LLM。

```go
type Provider interface {
    ID() string
    Name() string
    Chat(ctx context.Context, req *ChatRequest) (*ChatResponse, error)
    ChatStream(ctx context.Context, req *ChatRequest) (<-chan *StreamChunk, error)
    ListModels(ctx context.Context) ([]Model, error)
    HealthCheck(ctx context.Context) error
}

type Router struct {
    providers map[string]Provider
    fallbacks map[string][]string // agentID -> fallback provider chain
    mu        sync.RWMutex
}

// 路由策略：优先使用 Agent 绑定的 Provider，失败时按 fallback 链切换
func (r *Router) Route(ctx context.Context, agentID string, req *ChatRequest) (*ChatResponse, error) {
    primary := r.getProvider(agentID)
    resp, err := primary.Chat(ctx, req)
    if err == nil {
        return resp, nil
    }
    // fallback
    for _, fbID := range r.fallbacks[agentID] {
        fb := r.providers[fbID]
        resp, err = fb.Chat(ctx, req)
        if err == nil {
            return resp, nil
        }
    }
    return nil, fmt.Errorf("all providers failed for agent %s", agentID)
}
```

**支持的 Provider：**

| Provider | 类型 | 协议 |
|----------|------|------|
| Anthropic (Claude) | 云端 | REST API |
| OpenAI | 云端 | REST API |
| Google Gemini | 云端 | REST API |
| DeepSeek | 云端 | REST API |
| Groq | 云端 | REST API |
| Ollama | 本地 | REST API |
| vLLM | 本地 | OpenAI-compatible |
| 自定义端点 | 任意 | OpenAI-compatible |

## 4. 实现路线图

### Phase 1: 基础骨架

**目标：** 跑通单 Agent 对话 + 基础记忆

- [ ] Go 项目初始化（go mod, 目录结构）
- [ ] Provider 接口 + OpenAI/Anthropic 实现
- [ ] 单 Agent 执行循环（接收消息 → LLM → 响应）
- [ ] 思维链追踪数据结构
- [ ] Neo4j 连接 + 基础记忆 CRUD
- [ ] REST API 骨架（chi router）
- [ ] Docker Compose（Go + Neo4j + PostgreSQL + Redis）

### Phase 2: 认知记忆系统

**目标：** 实现完整的图式认知循环

- [ ] 扩散激活引擎（BFS + 权重衰减）
- [ ] 图式匹配算法（向量相似度 + 结构匹配）
- [ ] 同化/顺应逻辑
- [ ] 上下文注入（记忆 → LLM prompt）
- [ ] 记忆更新（LLM 响应 → 知识提取 → Neo4j）
- [ ] 记忆衰减机制（时间衰减 + 使用频率）

### Phase 3: 多Agent 编排

**目标：** 世界管家 + Team 协作

- [ ] 世界管家 Agent 实现（意图识别、任务拆解）
- [ ] Team 定义与成员管理
- [ ] 并行调度器（goroutine pool + 任务分发）
- [ ] Agent 间消息传递（Redis Streams）
- [ ] 任务状态追踪与结果汇总
- [ ] 上下文压缩引擎

### Phase 4: Gateway 接入

**目标：** 多平台消息接入 + 世界广播

- [ ] Gateway 适配器接口
- [ ] REST API Gateway（基础 HTTP 接入）
- [ ] Telegram Bot 适配器
- [ ] Discord Bot 适配器
- [ ] Slack App 适配器
- [ ] 飞书 Bot 适配器
- [ ] 世界广播系统（多平台同步推送）

### Phase 5: 世界模拟

**目标：** 居民日程、关系、成长系统

- [ ] 世界时钟 + tick 事件系统
- [ ] 居民日程管理（cron 调度）
- [ ] 社交关系图（Neo4j 存储）（通过自主社交学习他人方法论，优化自身）
- [ ] 记忆成长追踪 + 里程碑
- [ ] 居民状态机（工作/休息/自主社交/自主学习）

### Phase 6: 前端 — Nuka World UI

**目标：** 可视化面板 + 思维链展示，

- [ ] Next.js 项目初始化 + Tailwind 像素风主题
- [ ] 居民管理 + 卡片式显示（像素头像 + 属性面板）
- [ ] 居民日程管理，社交链查看与管理
- [ ] token消耗面板，速率估计，计费估计
- [ ] 思维链可视化（步骤流 + 实时 streaming，每个居民都要有）
- [ ] 工具调用链展示（调用 → 结果 → 下一步）
- [ ] 对话界面（支持选择居民对话，支持世界广播对话，支持team对话）
- [ ] 记忆图可视化（Neo4j 图谱浏览）
- [ ] 管理面板（Team 配置、Provider 管理、Gateway 状态）

## 5. 数据库设计
### 5.1 PostgreSQL（结构化数据）

```sql
-- 居民（Agent）
CREATE TABLE agents (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(100) NOT NULL,
    role        VARCHAR(100),
    personality TEXT,
    system_prompt TEXT,
    sprite_config JSONB,
    provider_id UUID REFERENCES providers(id),
    model       VARCHAR(100),
    status      VARCHAR(20) DEFAULT 'idle',
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- LLM Provider
CREATE TABLE providers (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(100) NOT NULL,
    type        VARCHAR(50) NOT NULL,
    endpoint    VARCHAR(500),
    api_key_enc BYTEA,
    config      JSONB,
    is_active   BOOLEAN DEFAULT true
);

-- Team
CREATE TABLE teams (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(100) NOT NULL,
    steward_id  UUID REFERENCES agents(id),
    workflow    JSONB,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Session
CREATE TABLE sessions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id    UUID REFERENCES agents(id),
    platform    VARCHAR(50),
    channel_id  VARCHAR(200),
    status      VARCHAR(20) DEFAULT 'active',
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 消息历史
CREATE TABLE messages (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id  UUID REFERENCES sessions(id),
    role        VARCHAR(20) NOT NULL,
    content     TEXT NOT NULL,
    thinking_chain JSONB,
    tokens_used INT,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);
```

### 5.2 Neo4j（图式记忆）

```cypher
// 图式节点
CREATE CONSTRAINT schema_id IF NOT EXISTS
FOR (s:Schema) REQUIRE s.id IS UNIQUE;

// 示例：创建图式
CREATE (s:Schema {
  id: 'schema_001',
  agent_id: 'agent_uuid',
  name: 'Go并发编程',
  description: 'goroutine、channel、sync包相关知识',
  activation_level: 0.0,
  strength: 1.0,
  created_at: datetime(),
  last_activated: datetime()
})

// 示例：创建记忆
CREATE (m:Memory {
  id: 'mem_001',
  agent_id: 'agent_uuid',
  content: '用户要求实现一个并发爬虫',
  embedding: [0.1, 0.2, ...],  // 向量嵌入
  importance: 0.8,
  access_count: 0,
  created_at: datetime()
})

// 示例：扩散激活查询
MATCH path = (trigger:Concept {name: $keyword})
  -[:ACTIVATES|RELATED_TO*1..3]-(node)
WHERE node.agent_id = $agentId
WITH node,
     reduce(w = 1.0, r IN relationships(path) |
       w * coalesce(r.weight, 0.5) * $decayFactor
     ) AS activation
WHERE activation > $threshold
RETURN node, activation
ORDER BY activation DESC
LIMIT $maxNodes
```

## 6. 部署架构

### 6.1 Docker Compose

```yaml
version: '3.9'
services:
  nuka:
    build: .
    ports:
      - "8080:8080"
      - "9090:9090"  # gRPC
    depends_on:
      - neo4j
      - postgres
      - redis
    environment:
      - NEO4J_URI=bolt://neo4j:7687
      - POSTGRES_DSN=postgres://nuka:nuka@postgres:5432/nukaworld
      - REDIS_URL=redis://redis:6379

  neo4j:
    image: neo4j:5-community
    ports:
      - "7474:7474"
      - "7687:7687"
    volumes:
      - neo4j_data:/data

  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: nukaworld
      POSTGRES_USER: nuka
      POSTGRES_PASSWORD: nuka
    volumes:
      - pg_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data

  web:
    build: ./web
    ports:
      - "3000:3000"
    depends_on:
      - nuka

volumes:
  neo4j_data:
  pg_data:
  redis_data:
```

## 7. API 设计概览

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/chat | 与世界管家对话 |
| POST | /api/agents/{id}/chat | 直接与指定居民对话 |
| GET | /api/agents | 列出所有居民 |
| POST | /api/agents | 创建居民 |
| GET | /api/agents/{id}/thinking | 获取思维链 |
| GET | /api/agents/{id}/memory | 查看记忆图 |
| GET | /api/agents/{id}/schedule | 查看日程 |
| GET | /api/agents/{id}/growth | 查看成长档案 |
| GET | /api/teams | 列出所有 Team |
| POST | /api/teams | 创建 Team |
| POST | /api/broadcast | 发送世界广播 |
| GET | /api/world/status | 世界状态概览 |
| WS | /api/ws | WebSocket 实时推送 |
| GET | /api/providers | 列出 Provider |
| POST | /api/providers | 添加 Provider |
| GET | /api/gateways | Gateway 状态 |

---

> 文档结束。按 Phase 1-6 顺序实现，每个 Phase 完成后进行集成测试。
