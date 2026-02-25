# Nuka World — 现有功能与实现总结

> 版本: 0.1.0 | 更新日期: 2026-02-25

## 1. 项目概述

Nuka World 是一个基于 Go 的 AI Agent 世界模拟系统，配合 Next.js 前端管理面板。每个 Agent 是世界中的「居民」，拥有独立人格、记忆、日程和社交关系。系统支持多 LLM Provider 路由、工具调用循环、多平台 Gateway 接入和团队协作编排。

**技术栈:**
- 后端: Go 1.25, chi router, Neo4j, Redis, PostgreSQL
- 前端: Next.js 16.1.6, React 19, Tailwind CSS 4, TypeScript
- 模块路径: `github.com/nidhogg/nuka-world`

## 2. 项目结构

```
Nuka/
├── cmd/nuka/main.go              # 入口，组装所有组件
├── internal/
│   ├── agent/                    # Agent 引擎与工具系统
│   │   ├── engine.go             # Engine: 对话处理、工具调用循环
│   │   ├── persona.go            # Persona: Agent 人格定义
│   │   ├── thinking.go           # 思维链处理
│   │   ├── tools.go              # ToolRegistry: 工具注册与执行
│   │   └── builtin_tools.go      # 内置工具 (web_search, read_file 等)
│   ├── api/                      # HTTP API 层
│   │   ├── handler.go            # Handler: 路由定义与请求处理
│   │   └── handler_test.go       # 6 个功能测试
│   ├── context/                  # 上下文压缩
│   │   ├── compressor.go         # Compressor: 对话历史压缩
│   │   └── types.go              # 上下文类型定义
│   ├── gateway/                  # 多平台网关
│   │   ├── gateway.go            # Gateway: 适配器管理
│   │   ├── broadcast.go          # Broadcaster: 消息广播
│   │   ├── rest.go               # RESTAdapter: HTTP 接入
│   │   ├── slack.go              # Slack 适配器
│   │   ├── discord.go            # Discord 适配器
│   │   └── types.go              # 网关类型定义
│   ├── memory/                   # 图式认知记忆系统
│   │   ├── store.go              # MemoryStore: Neo4j 存储
│   │   ├── schema.go             # 图式定义 (Piaget 理论)
│   │   ├── activation.go         # 扩散激活网络 (Collins & Loftus)
│   │   ├── cognitive.go          # 认知处理
│   │   ├── context.go            # 记忆上下文构建
│   │   ├── decay.go              # 记忆衰减
│   │   ├── matching.go           # 记忆匹配
│   │   └── similarity.go         # 相似度计算
│   ├── orchestrator/             # 团队编排
│   │   ├── steward.go            # Steward: 任务分解与聚合
│   │   ├── scheduler.go          # 任务调度
│   │   ├── messaging.go          # Agent 间消息传递
│   │   └── types.go              # 编排类型定义
│   ├── provider/                 # LLM Provider 路由
│   │   ├── router.go             # Router: 多 Provider 路由与 fallback
│   │   ├── openai.go             # OpenAI 兼容 Provider
│   │   ├── anthropic.go          # Anthropic Provider
│   │   └── types.go              # Provider 类型定义
│   └── world/                    # 世界模拟
│       ├── simulation.go         # WorldClock: 世界时钟 tick 驱动
│       ├── state.go              # StateManager: Agent 状态管理
│       ├── schedule.go           # ScheduleManager: 日程管理
│       ├── heartbeat.go          # Heartbeat: 自动发现 Agent 并触发自主思考
│       ├── growth.go             # GrowthTracker: Agent 成长追踪
│       └── relation.go           # 社交关系管理
├── web/                          # Next.js 前端
│   └── src/
│       ├── app/                  # 10 个页面路由
│       ├── components/           # 8 个共享组件
│       └── lib/                  # API 客户端、i18n、类型定义
├── configs/                      # 配置文件目录
├── migrations/                   # 数据库迁移
├── docker-compose.yml            # Neo4j + Redis + PostgreSQL
├── Dockerfile                    # Go 后端容器化
└── docs/
    ├── DESIGN.md                 # 原始设计文档
    └── ARCHITECTURE.md           # 本文档
```

## 3. 后端模块详解

### 3.1 Agent 引擎 (`internal/agent/`)

**Engine** — 核心对话处理器:
- `Chat(agentID, userMessage)` → 构建 system prompt + 记忆上下文 → 调用 LLM → 处理工具调用
- 工具调用循环: LLM 返回 `tool_calls` → 执行工具 → 结果追加到消息 → 再次调用 LLM（最多 5 轮）
- 内存中维护 `agents map[string]*AgentInstance`，每个实例持有 Persona + 对话历史

**Persona** — Agent 人格:
- 字段: ID, Name, Role, Personality, Backstory, SystemPrompt, ProviderID, Model
- 自动生成 UUID 作为 Agent ID

**ToolRegistry** — 工具注册与执行:
- `Register(name, description, parameters, handler)` 注册工具
- `Execute(name, arguments)` 执行工具并返回结果
- `ToOpenAITools()` 转换为 OpenAI function calling 格式

**内置工具** (`builtin_tools.go`):
- `web_search` — 网页搜索（占位实现）
- `read_file` — 读取文件内容
- `write_file` — 写入文件
- `run_command` — 执行 shell 命令
- `memory_store` — 存储记忆
- `memory_recall` — 检索记忆

### 3.2 Provider 路由 (`internal/provider/`)

**Router** — 多 Provider 路由:
- 注册多个 Provider，按优先级排序
- `Complete(messages, tools)` → 尝试首选 Provider，失败则 fallback 到下一个
- 支持 OpenAI 兼容和 Anthropic 两种协议

**OpenAI Provider** (`openai.go`):
- 兼容所有 OpenAI API 格式的端点（OpenAI、讯飞星辰 MaaS、本地 Ollama 等）
- `chatURL()` 辅助方法: 支持 `path_model` 模式（模型名嵌入 URL 路径而非 body）
- 支持 function calling / tool_calls 解析

**Anthropic Provider** (`anthropic.go`):
- Claude Messages API 格式
- 支持 tool_use 响应解析

### 3.3 记忆系统 (`internal/memory/`)

基于 Neo4j 图数据库的认知记忆系统:

- **Schema** — Piaget 图式理论: 记忆节点有类型（episodic/semantic/procedural）、强度、衰减率
- **Activation** — Collins & Loftus 扩散激活: 从查询节点出发，沿关系边扩散激活值，找到相关记忆
- **Decay** — 艾宾浩斯遗忘曲线: 记忆强度随时间衰减，低于阈值的记忆被标记为 dormant
- **Matching** — 语义匹配: 基于关键词和嵌入向量的记忆检索
- **Similarity** — 余弦相似度计算
- **Context** — 记忆上下文构建: 将检索到的记忆格式化为 LLM 可理解的上下文

### 3.4 世界模拟 (`internal/world/`)

- **WorldClock** (`simulation.go`) — tick 驱动的世界时钟，支持倍速调节，通过 `ClockListener` 接口通知订阅者
- **StateManager** (`state.go`) — Agent 状态机: idle → active → resting，基于日程自动切换
- **ScheduleManager** (`schedule.go`) — Agent 日程管理: 创建/查询/排空待执行日程
- **Heartbeat** (`heartbeat.go`) — 自动发现所有 Agent，定期触发自主思考循环
- **GrowthTracker** (`growth.go`) — Agent 成长追踪: 经验值、等级、技能熟练度
- **Relation** (`relation.go`) — Agent 间社交关系: 好感度、互动历史

### 3.5 团队编排 (`internal/orchestrator/`)

- **Steward** (`steward.go`) — 团队管理者: 接收任务 → 分解为子任务 → 分配给成员 Agent → 聚合结果
- **Scheduler** (`scheduler.go`) — 子任务调度: 支持 round-robin、priority、capability-based 策略
- **Messaging** (`messaging.go`) — Agent 间消息传递: 基于 Redis Pub/Sub 的异步通信

### 3.6 网关系统 (`internal/gateway/`)

- **Gateway** (`gateway.go`) — 适配器注册与管理
- **Broadcaster** (`broadcast.go`) — 消息广播: 将 Agent 回复分发到所有已连接适配器
- **RESTAdapter** (`rest.go`) — HTTP API 接入
- **Slack** (`slack.go`) — Slack Bot 适配器: webhook + bot token
- **Discord** (`discord.go`) — Discord Bot 适配器

### 3.7 上下文压缩 (`internal/context/`)

- **Compressor** (`compressor.go`) — 对话历史压缩: 当消息数超过阈值时，调用 LLM 生成摘要替换旧消息

## 4. API 路由表

后端监听 `:8080`，所有路由前缀 `/api`。

| 方法 | 路径 | 功能 |
|------|------|------|
| GET | `/api/health` | 健康检查，返回 `{status: "ok", world: "nuka"}` |
| GET | `/api/agents` | 列出所有 Agent |
| POST | `/api/agents` | 创建 Agent（含 persona 定义） |
| GET | `/api/agents/{id}` | 获取单个 Agent |
| POST | `/api/agents/{id}/chat` | 与 Agent 对话 |
| GET | `/api/providers` | 列出所有 LLM Provider |
| POST | `/api/providers` | 添加 Provider |
| GET | `/api/skills` | 列出所有技能/MCP 服务 |
| POST | `/api/skills` | 添加技能 |
| DELETE | `/api/skills/{name}` | 删除技能 |
| GET | `/api/adapters` | 列出所有网关适配器 |
| POST | `/api/adapters` | 添加/更新适配器（upsert） |
| GET | `/api/world/status` | 世界状态概览 |
| POST | `/api/world/schedules` | 创建日程 |
| POST | `/api/world/heartbeat` | 触发心跳（自主思考） |
| GET | `/api/teams` | 列出所有团队 |
| POST | `/api/teams` | 创建团队 |
| POST | `/api/teams/{id}/task` | 向团队提交任务 |

## 5. 前端页面

前端监听 `:3000`，基于 Next.js App Router，共 10 个路由。

| 路由 | 页面 | 功能 |
|------|------|------|
| `/` | Dashboard | 世界概览: 居民数、活跃数、世界时间、活动流 |
| `/residents` | Residents | Agent 管理: 列表 + 创建表单（名称/角色/性格/背景/模型） |
| `/chat` | Chat | 对话界面: Agent/Team 双模式切换，实时对话 |
| `/memory` | Memory Graph | 记忆图谱可视化（Canvas 绘制） |
| `/teams` | Teams | 团队管理: 创建团队、选择策略和成员 |
| `/providers` | Providers | LLM Provider 管理: 名称/URL/Token 简化配置 |
| `/gateway` | Gateway | 网关适配器管理: Slack/Discord/HTTP 配置 |
| `/skills` | Skills | 技能管理: 内置/MCP/自定义三种类型 |
| `/mcp` | MCP Servers | MCP 服务专属页: SSE/Stdio/HTTP 传输方式 |

**前端共享组件:**
- `Sidebar.tsx` — 侧边导航栏，9 个入口 + 系统状态 + 用户信息
- `PageLayout.tsx` — 页面布局容器（Sidebar + 内容区）
- `PageHeader.tsx` — 页面标题 + CN/EN 语言切换
- `ChatArea.tsx` — 对话消息区域 + 输入框
- `ConversationList.tsx` — Agent/Team 列表切换
- `GraphCanvas.tsx` — Canvas 记忆图谱绘制
- `NodeDetailPanel.tsx` — 记忆节点详情面板
- `ClientProviders.tsx` — 客户端 Provider 包装（I18nProvider）

**i18n 系统** (`lib/i18n.tsx`):
- React Context 实现，支持 `en` / `zh` 两种语言
- 130+ 翻译键值对，覆盖所有页面

## 6. 测试覆盖

`internal/api/handler_test.go` — 6 个 HTTP API 功能测试，使用 `httptest` + 内存依赖（无需 Neo4j/Redis）:

| 测试 | 覆盖内容 |
|------|----------|
| TestHealthCheck | GET /api/health → 200, status=ok, world=nuka |
| TestProviderCRUD | 添加 Provider → 列表验证 → 缺失字段 400 |
| TestSkillCRUD | 添加/列表/删除技能 → 删除不存在 404 → 缺失字段 400 |
| TestAdapterCRUD | 添加 Slack 适配器 → 列表 → upsert 更新 → 验证更新 |
| TestAgentCRUD | 列表空 → 创建 Agent → 按 ID 获取 → 不存在 404 |
| TestWorldStatus | 世界状态 → world="Nuka World", agent_count=0 |

## 7. 基础设施

**Docker Compose** 提供三个外部依赖:
- Neo4j — 记忆图数据库
- Redis — 团队消息 Pub/Sub、Session 缓存
- PostgreSQL — 持久化存储（预留）

**环境变量** (`.env`):
- `NEO4J_URI`, `NEO4J_USER`, `NEO4J_PASSWORD`
- `REDIS_ADDR`
- `DATABASE_URL` (PostgreSQL)
- LLM Provider 相关配置

## 8. 当前状态与已知问题

**已完成:**
- ✅ 全部后端模块实现（agent, provider, memory, world, orchestrator, gateway, context, api）
- ✅ 前端 10 个页面 + i18n 双语支持
- ✅ 6 个 API 功能测试全部通过
- ✅ Docker Compose 基础设施配置
- ✅ 工具调用循环（最多 5 轮）
- ✅ Heartbeat 自主思考机制
- ✅ 多 Provider fallback 路由

**已知问题:**
- ⚠️ 讯飞星辰 MaaS API 调用时出现 PathDomainError（外部 API 兼容性问题）
- ⚠️ 记忆系统依赖 Neo4j，未连接时相关功能不可用
- ⚠️ 团队编排依赖 Redis，未连接时团队功能不可用
- ⚠️ 内置工具 `web_search` 为占位实现，需接入实际搜索 API

## 9. 后续开发方向

- [ ] 接入实际搜索 API 替换 `web_search` 占位实现
- [ ] 前端 Memory Graph 页面接入后端记忆 API，实现交互式图谱
- [ ] WebSocket 实时推送（Agent 状态变更、世界事件）
- [ ] Agent 像素风头像生成与展示
- [ ] 完善 Slack/Discord 适配器的双向消息处理
- [ ] 添加更多 Provider 支持（Google Gemini、本地 Ollama）
- [ ] 记忆系统性能优化（批量激活、缓存热点记忆）
- [ ] 前端深色主题微调与移动端适配
- [ ] CI/CD 流水线配置
- [ ] 更完整的测试覆盖（记忆系统、编排器、网关）
