# Design: Workflow Packs + Workspace Channels + Agent Clones (Multi-Agent Presets)

日期: 2026-03-03

## 概述

为 `nuka-world` 增加一个**可交互、可持久化、可分享**的工作流系统，用于把 World（主世界）变成“workflow 构建器/调度器”，并提供多 Agent 预设（面向 AI 推理工程师的工作/生活/资料体系）。

核心要求：
- 显式触发：`/workflow ...` 进入工作流；进入后**自动接管对话**。
- 强约束决策点：每个重要决策以 **3 选 1** 的形式呈现；手动模式用 Slack/Discord 组件增强选择体验，文本 `1/2/3` 作为 fallback。
- 多轮思考：Decision 可配置 `auto` 模式，由指定 Agent 多轮评估后自动选择（并输出可读的理由摘要）。
- Workspace 频道：首次部署的“管理入口”为管理员频道；工作流执行在 workspace 频道进行。
  - Discord：temp/persistent 都创建新的文字频道作为 workspace。
  - Slack：Phase 1 允许用 thread 作为 workspace（无管理员权限也可用）；Phase 2 支持创建频道。
- 持久化：工作流末期 hook 询问是否保存。保存则保留 workspace 并重命名为用户指定名字，绑定为长期 workflow-team；不保存则落盘 transcript 并清理 workspace。
- 分身（clone）：多个 workflow 并行时，若复用同一“预设 Agent”，为 temp workflow 创建 clone 分身执行；若最终“持久化 team”，则保留专有 Agent（等价永久 clone），**专有记忆不回写**。

---

## 目标与非目标

### 目标
- 在对话侧实现“可暂停/可继续/可恢复”的 workflow run。
- 支持 workflow 打包（Workflow Pack）与分享（导入/导出）。
- 为 AI 推理工程师提供覆盖“工作/资料/生活”的多 Agent 预设与典型流程（研究→方案→任务→实现→验证）。
- 与现有 `internal/orchestrator`（并行派发）与 `internal/a2a`（多轮协作对话）复用集成。

### 非目标（Phase 2+）
- 完整 Web 管理后台（token/provider/agent 配置）一次性做完；Phase 1 先提供命令 + 管理员频道组件。
- 复杂的自动“需求-工作流匹配”推荐系统（Phase 1 先做基于 tags/关键词/用户确认的匹配）。

---

## 术语

- **Workflow Pack**：可分享的工作流模板（流程图 + team 角色 + 策略）。
- **Workflow Binding**：把某个频道绑定到 Pack（这个频道就是“持久化 workflow-team 的主频道”）。
- **Workflow Run**：一次执行实例；在一个 workspace 频道里运行，具有状态机。
- **Workspace Channel**：为某次 run 创建的专用工作区频道（或 Slack thread）。
- **Preset Agent**：用户预设的“角色模板”（如 scout/planner/builder）。
- **Agent Instance**：某个 Pack 在某次 run 中实例化出的具体 agent（可能是 clone）。
- **Clone（分身）**：从 preset/base 派生出的临时 agent，用于并行隔离（独立记忆）。

---

## 核心交互与路由规则

### 显式触发
新增命令族（Phase 1）：
- `/workflow start <需求描述>`：从管理员频道（或任意频道）发起 workflow。
- `/workflow status`：查看当前用户在当前频道的 workflow 状态（如存在）。
- `/workflow cancel`：取消当前 workflow run。
- `/workflow choose <1|2|3>`：文本 fallback（当组件不可用时）。
- `/workflow packs`：列出可用 packs。
- `/workflow export <pack_id>` / `/workflow import <json>`：分享/导入。
- `/workflow bind <pack_id>` / `/workflow unbind`：绑定频道与 pack（持久化 workflow-team）。

### 自动接管对话（Hook）
MessageRouter 增加拦截：
- 对于非 `/` 开头的消息，若存在 `active run` 绑定到 `(platform, channel_id, user_id)`，则把消息交给 workflow runtime 处理。
- Slash commands 始终优先走原 command dispatch（避免接管后无法操作）。

并行约束：
- **同一用户在同一频道**同时最多 1 个活跃 run。
- 同一频道不同用户可并行多个 run。
- Agent 冲突用 clone 或持久化专有团队解决（见“分身与持久化”）。

---

## Workspace 频道生命周期

### 统一流程（用户视角）
1. 用户在管理员频道向 `world` 发起 `/workflow start ...`。
2. `world` 分析需求并进入 Decision(3 options)：
   - 选项 A：使用当前频道绑定的 pack（如有且匹配）
   - 选项 B：从 packs 中选择一个（或按 tags 推荐）
   - 选项 C：创建临时 workflow（让 world 生成一个临时 pack/team）
3. 根据选择，创建 workspace（Discord 一定新建文字频道；Slack Phase 1 可 thread）。
4. 用户在 workspace 中对话，workflow 自动接管。
5. workflow 结束时强制出现 “保存/不保存” hook（Decision 3 选 1）。
6. 若保存：保留 workspace 并重命名为用户指定名字，写入 binding + 持久化 team。
7. 若不保存：落盘 transcript，清理 workspace（Discord 删除/归档；Slack archive 或提示手动清理，取决于权限）。

### 频道命名
保存时必须由用户确认名字：
- 提供 2 个建议名 + 1 个“自定义输入”入口（保持 3 选 1 的决策形式）。
- 选择“自定义”后进入一个 `awaiting_input(channel_name)` 状态，用户发送任意文本作为频道名；系统再进行一次“确认/修改/取消”（3 选 1）。

---

## 3 选 1 强约束：组件优先，文本 fallback

### Slack
- 以 Block Kit buttons 展示 3 个选项（按钮点击触发 choose）。
- Phase 1 可先用“消息按钮 + 回复 1/2/3”混合；Phase 2 做完整 interactive callback。

### Discord
- 使用 Buttons 或 SelectMenu（interaction）展示 3 个选项。
- 仍支持回复 `1/2/3` fallback。

### Auto 模式（多轮思考）
Pack 或 Run 可配置：
- `decision_mode = manual | auto`
- `auto_thinking_rounds = N`
- `decider_agent_role = "planner" | "world" | ...`

行为：
- auto 模式下，DecisionNode 生成 3 options 后，由 decider agent 进行 N 轮评估/反思（以多次 Execute 调用实现），最终自动 choose。
- 对用户只展示：选择结果 + 结构化理由摘要（不强依赖展示原始 thinking chain）。

---

## Pack 与 Team：工作流的“固化与分享”

### Pack Schema（简化版）
`WorkflowPack`（JSON）至少包含：
- `id`, `name`, `description`, `tags[]`, `version`
- `team`: roles[]（每个 role 指向一个 preset/base，及其 skills/tool policy）
- `graph`: nodes[] + edges[]（或顺序 steps[]，Phase 1 可先顺序）
- `policies`: decision_mode、auto_thinking_rounds、workspace_strategy、cleanup_strategy 等

### Team 是 Workflow 的具体实现
- Pack 定义 team 角色与固定技能（固定工具白名单）。
- Run 实例化 team：为每个 role 创建/分配 Agent Instance（必要时 clone）。
- 持久化时：保存“专有 team”（固定 agent instances）并绑定到频道。

---

## 分身（Clone）与记忆策略

### temp workflow
- 若某个 role 需要复用一个 preset agent，但该 preset 当前被其他 run 使用：
  - 创建 clone（新 agentID）并分配该 role。
- clone 记忆隔离：
  - clone 使用独立 agentID，因此 memory/RAG 天然隔离。
- temp run 结束：
  - 默认不回写到 preset/base agent 的长期记忆。
  - 仅可选：把“最终摘要”写入 `world`（用于系统级 recall），且由 pack 明确开启。

### persisted workflow-team
保存时：
- 将该 run 的 role->agent instance 固化为“专有团队”：
  - 这些 agent 实例成为长期存在的专有 agent（可在 `/agents` 查看）。
  - 专有记忆永不回写到 base/preset。

实现建议：
- Persona 增加 `ProfileID`（或等价字段）用于“继承 agents/<profile_id>/ SOUL/Agent/GOALS 注入”，避免复制磁盘目录。
- clone 的 `ProfileID = basePresetID`，但 `Persona.ID` 不同。

---

## 与现有 orchestrator / a2a 的集成策略

### 并行任务（orchestrator）
- workflow 节点可以声明为 `parallel_tasks`：
  - 拆分子任务并行派发（复用 Scheduler）
  - 结果聚合再进入下一节点（或进入 Decision）

### 多轮协作（a2a）
- workflow 节点类型 `a2a_conversation`：
  - 用 A2A Planner 提议参与者（或固定 team roles）
  - maxRounds 可由 pack 设置
  - 会话摘要输出进入 workflow transcript，并可触发后续 Decision

---

## 多 Agent 预设（面向 AI 推理工程师）

预设以“角色模板”形式提供（Phase 1 先 seed 到 DB/engine；profiles 放在 `agents/` 目录）。

建议的 presets：
- `world`：工作流调度/审批/汇总
- `scout`：资料搜集（web search + RAG store）
- `paper_reader`：论文/专利阅读与要点提炼
- `planner`：任务拆解、里程碑、风险、时间预算
- `architect`：系统设计、性能权衡、接口契约
- `builder`：代码实现（对接 codex/claudecode 等工具型 MCP）
- `reviewer`：测试计划、回归、代码审查清单
- `ops`：部署、Docker、可观测性、故障排查
- `data_engineer`：数据标注/清洗/评估集构建
- `life_admin`：日程、提醒、复盘、生活事务

每个 preset 绑定固定 skill/tool 白名单（通过 skill manager + tool filter）。

---

## 持久化模型（PostgreSQL）

新增表（建议 migration `007_workflows.up.sql`）：
- `workflow_packs`：pack JSON、版本、作者、tags
- `workflow_bindings`：`(platform, channel_id) -> pack_id`，以及绑定的“专有 team”信息
- `workflow_runs`：run 状态机、workspace channel、用户、当前节点、decision options、policies
- `workflow_run_messages`：transcript（可选，Phase 1 可直接塞到 runs.jsonb）
- `workflow_leases`：agent instance 占用（用于避免并行冲突）

---

## Phase 划分

### Phase 1（先打通闭环）
- `/workflow` 命令族 + run 状态机 + 自动接管对话
- Decision 3 选 1（文本 fallback 完整可用）
- Discord：创建 workspace 文字频道（需管理员 token）
- Slack：先用 thread/workspace（不强依赖管理员）
- clone/专有 team：temp 用 clone；保存则固化专有 agent，不回写记忆
- transcript 落盘 + 结束清理

### Phase 2（体验与管理增强）
- Slack Block Kit / Discord Components 全链路（交互回调、按钮选择）
- Slack 频道创建/重命名/归档（管理员模式）
- 管理员频道的 provider/model 分配组件（把现有 `/providers` `/models` `/switch_*` 能力做成 UI）
- token 管理与“上下文预算/压缩”视图

---

## 测试策略

- 单测：workflow 状态机（start/choose/await_input/complete/cancel）与并发 lease。
- 集成：mock agent executor（不依赖真实 LLM）验证节点执行与聚合。
- E2E（REST gateway）：
  - 需要让 REST gateway 支持传入固定 `channel_id`（否则无法模拟同频道多轮消息）。
  - 覆盖：start → workspace → choose → run → save/rename → bind。

