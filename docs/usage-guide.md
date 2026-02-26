# Nuka World 使用指南

## 目录

1. [前置条件](#1-前置条件)
2. [环境配置](#2-环境配置)
3. [启动服务](#3-启动服务)
4. [CLI Chat 交互工具](#4-cli-chat-交互工具)
5. [Slack 机器人配置](#5-slack-机器人配置)
6. [Discord 机器人配置](#6-discord-机器人配置)
7. [Gateway 诊断](#7-gateway-诊断)
8. [常见问题排查](#8-常见问题排查)

---

## 1. 前置条件

运行 Nuka World 需要以下基础设施（可选，按需启用）：

| 服务 | 用途 | 必需？ |
|------|------|--------|
| PostgreSQL | 会话持久化、Agent 存储 | 推荐 |
| Neo4j | 记忆图谱、关系网络 | 推荐 |
| Redis | 消息总线、团队协作调度 | 团队功能需要 |
| LLM Provider | Agent 的大脑（讯飞/OpenAI/Anthropic） | **必需** |

如果只想快速体验 CLI 对话，最低要求是：配置一个 LLM Provider。

---

## 2. 环境配置

### 2.1 复制环境变量模板

```bash
cp .env.example .env
```

### 2.2 编辑 `.env`，填入你的密钥

```bash
# Nuka World Configuration
PORT=3210

# LLM Providers — 至少配置一个
# 讯飞星辰MaaS（OpenAI 兼容接口）
XFYUN_API_KEY=你的讯飞API密钥

# 或者 OpenAI
OPENAI_API_KEY=sk-xxx

# 或者 Anthropic
ANTHROPIC_API_KEY=sk-ant-xxx

# 数据库（可选，不配置则部分功能降级）
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=你的密码

POSTGRES_DB=nukaworld
POSTGRES_USER=nuka
POSTGRES_PASSWORD=你的密码

REDIS_URL=redis://localhost:6379

# Gateway Tokens（Slack/Discord，按需配置）
SLACK_BOT_TOKEN=
SLACK_APP_TOKEN=
DISCORD_BOT_TOKEN=
```

### 2.3 配置文件说明

主配置文件位于 `configs/nuka.json`，已使用 `${VAR}` 语法引用环境变量：

```json
{
  "server": { "port": 3210 },
  "providers": [
    {
      "id": "xfyun",
      "type": "openai",
      "name": "讯飞星辰MaaS",
      "endpoint": "https://maas-api.cn-huabei-1.xf-yun.com/v2",
      "api_key": "${XFYUN_API_KEY}"
    }
  ],
  "gateway": {
    "slack":   { "enabled": true, "bot_token": "${SLACK_BOT_TOKEN}", "app_token": "${SLACK_APP_TOKEN}" },
    "discord": { "enabled": true, "bot_token": "${DISCORD_BOT_TOKEN}" }
  }
}
```

如果某个 Gateway 的 token 为空，启动时会自动跳过该适配器（不会报错）。

---

## 3. 启动服务

### 3.1 编译并启动主服务

```bash
go run cmd/nuka/main.go
```

启动成功后会看到类似输出：

```
INFO  Starting Nuka World...
INFO  Config loaded  {"path": "configs/nuka.json"}
INFO  Loaded agents from DB  {"count": 2}
INFO  Orchestrator initialized
INFO  slack adapter connected via socket mode  {"bot": "nuka-bot", "team": "MyWorkspace"}
INFO  discord adapter connected  {"user": "NukaBot", "guilds": 1}
INFO  World simulation started
INFO  Nuka World listening  {"port": "3210"}
```

如果某些可选服务（Neo4j、Redis 等）未启动，会看到 `WARN` 日志但不会阻止启动：

```
WARN  Neo4j unavailable, running without memory
WARN  Redis unavailable, running without orchestrator
```

### 3.2 自定义配置路径

```bash
CONFIG_PATH=./my-config.json go run cmd/nuka/main.go
```

### 3.3 确认服务正常

```bash
curl http://localhost:3210/api/gateway/status
```

返回各 Gateway 适配器的连接状态（详见第 7 节）。

---

## 4. CLI Chat 交互工具

CLI Chat 是一个独立的命令行 REPL 工具，用于直接与 Nuka World 的 Agent 对话，无需 Slack/Discord。

### 4.1 启动 CLI Chat

确保主服务已在运行（第 3 节），然后在另一个终端：

```bash
go run cmd/chat/main.go
```

默认连接 `http://localhost:3210`。可通过参数自定义：

```bash
go run cmd/chat/main.go -server http://localhost:3210 -user my-name
```

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `-server` | `http://localhost:3210` | Nuka World 服务地址 |
| `-user` | `cli-user` | 你的用户名（会显示在对话中） |

### 4.2 基本对话

启动后直接输入消息即可与 Agent 对话：

```
> 你好，今天天气怎么样？
[agent-001] 你好！我是 Nuka World 的 Agent，很高兴和你聊天...
```

### 4.3 指定 Agent 对话

使用 `@AgentName` 前缀将消息路由到特定 Agent：

```
> @Nuka 你最近在忙什么？
[nuka] 我一直在观察这个世界的变化...
```

使用 `@team-<名称>` 将消息路由到整个团队：

```
> @team-research 我们需要讨论一下新的研究方向
```

如果系统中只有一个 Agent，消息会自动路由到它，无需 `@` 前缀。

### 4.4 内置命令

| 命令 | 说明 |
|------|------|
| `/agents` | 列出所有已注册的 Agent 及其角色 |
| `/status` | 查看 Gateway 连接状态（Slack/Discord/REST） |
| `exit` 或 `quit` | 退出 CLI Chat |

### 4.5 示例会话

```
Nuka World CLI Chat
Server: http://localhost:3210 | User: cli-user
Type 'exit' or 'quit' to leave. Use @AgentName or @team-Name to route.
Commands: /status, /agents
---
Available agents:
  @Nuka (explorer)
  @Aria (researcher)

> /status
Gateway Status:
  ✓ rest — listening
  ✓ slack — bot connected at 2026-02-26T10:00:00Z
  ✗ discord (open failed: 401 Unauthorized)

> @Nuka 你好！
[nuka] 你好！我是 Nuka，一个探索者。有什么我能帮你的吗？

> exit
Bye!
```

---

## 5. Slack 机器人配置

### 5.1 创建 Slack App

1. 访问 [Slack API](https://api.slack.com/apps)，点击 **Create New App** → **From scratch**
2. 输入 App 名称（如 `NukaBot`），选择你的 Workspace
3. 进入 **OAuth & Permissions**，添加以下 Bot Token Scopes：
   - `chat:write` — 发送消息
   - `app_mentions:read` — 读取 @提及
   - `channels:history` — 读取频道消息
   - `im:history` — 读取私聊消息
   - `users:read` — 读取用户信息
4. 点击 **Install to Workspace**，授权后获得 **Bot User OAuth Token**（以 `xoxb-` 开头）

### 5.2 启用 Socket Mode

1. 进入 **Socket Mode**，开启 **Enable Socket Mode**
2. 创建一个 App-Level Token（Scope 选 `connections:write`），获得 **App Token**（以 `xapp-` 开头）

### 5.3 启用事件订阅

1. 进入 **Event Subscriptions**，开启 **Enable Events**
2. 在 **Subscribe to bot events** 中添加：
   - `message.channels` — 频道消息
   - `message.im` — 私聊消息
   - `app_mention` — @提及

### 5.4 填入 Token

将获得的两个 Token 填入 `.env`：

```bash
SLACK_BOT_TOKEN=xoxb-你的Bot-Token
SLACK_APP_TOKEN=xapp-你的App-Token
```

### 5.5 验证连接

重启 Nuka World 服务，观察日志：

```
INFO  slack adapter connected via socket mode  {"bot": "NukaBot", "team": "YourWorkspace"}
```

如果 Token 无效，会看到：

```
WARN  some gateway adapters failed to connect
ERROR slack AuthTest failed — check bot token
```

### 5.6 在 Slack 中使用

- 将 Bot 邀请到频道：`/invite @NukaBot`
- 在频道中 @NukaBot 发送消息即可触发对话
- 也可以直接给 Bot 发私聊消息

---

## 6. Discord 机器人配置

### 6.1 创建 Discord Bot

1. 访问 [Discord Developer Portal](https://discord.com/developers/applications)，点击 **New Application**
2. 输入名称（如 `NukaBot`），点击 **Create**
3. 进入左侧 **Bot** 页面，点击 **Reset Token** 获取 Bot Token
4. 在 **Privileged Gateway Intents** 中开启：
   - **Message Content Intent** — 读取消息内容（必需）

### 6.2 生成邀请链接

1. 进入左侧 **OAuth2** → **URL Generator**
2. Scopes 勾选：`bot`
3. Bot Permissions 勾选：
   - `Send Messages` — 发送消息
   - `Read Message History` — 读取历史消息
4. 复制生成的 URL，在浏览器中打开，选择你的服务器并授权

### 6.3 填入 Token

将 Bot Token 填入 `.env`：

```bash
DISCORD_BOT_TOKEN=你的Discord-Bot-Token
```

### 6.4 验证连接

重启 Nuka World 服务，观察日志：

```
INFO  discord adapter connected  {"user": "NukaBot", "guilds": 1}
```

如果 Bot 未被邀请到任何服务器：

```
WARN  discord bot not added to any server — invite it first
```

如果 Token 无效：

```
WARN  some gateway adapters failed to connect
ERROR discord open: ...401 Unauthorized
```

### 6.5 在 Discord 中使用

- 在已邀请 Bot 的服务器频道中直接发送消息
- Bot 会监听 Guild 消息和私聊消息并自动回复

---

## 7. Gateway 诊断

### 7.1 API 端点

```bash
curl http://localhost:3210/api/gateway/status
```

返回 JSON 数组，每个元素代表一个适配器的状态：

```json
[
  {
    "platform": "rest",
    "connected": true
  },
  {
    "platform": "slack",
    "connected": true,
    "connected_at": "2026-02-26T10:00:00Z",
    "details": "bot connected at 2026-02-26T10:00:00Z"
  },
  {
    "platform": "discord",
    "connected": true,
    "connected_at": "2026-02-26T10:00:05Z",
    "details": "bot=NukaBot, guilds=1"
  }
]
```

### 7.2 状态字段说明

| 字段 | 说明 |
|------|------|
| `platform` | 适配器名称（rest / slack / discord） |
| `connected` | 是否已连接 |
| `connected_at` | 连接成功时间（仅连接成功时存在） |
| `details` | 连接详情（Bot 名称、Guild 数量等） |
| `error` | 错误信息（仅连接失败时存在） |

### 7.3 CLI Chat 中查看

在 CLI Chat 中输入 `/status` 可以看到彩色格式的状态输出：

```
Gateway Status:
  ✓ rest
  ✓ slack — bot connected at 2026-02-26T10:00:00Z
  ✗ discord (open failed: 401 Unauthorized)
```

---

## 8. 常见问题排查

### Q: 启动时报 `failed to load config`

检查配置文件路径是否正确。默认读取 `configs/nuka.json`，可通过 `CONFIG_PATH` 环境变量指定。

### Q: Slack Bot 在频道中 @提及没有反应

1. 确认 `.env` 中 `SLACK_BOT_TOKEN` 和 `SLACK_APP_TOKEN` 都已填写
2. 确认 Slack App 已开启 **Socket Mode**
3. 确认已订阅 `app_mention` 和 `message.channels` 事件
4. 查看启动日志是否有 `slack adapter connected via socket mode`
5. 确认 Bot 已被邀请到目标频道（`/invite @BotName`）

### Q: Discord Bot 报 401 Unauthorized

Token 无效或已过期。前往 Discord Developer Portal → Bot → **Reset Token** 重新生成。

### Q: Discord Bot 连接成功但 guilds=0

Bot 未被邀请到任何服务器。使用 OAuth2 URL Generator 生成邀请链接并授权到你的服务器。

### Q: CLI Chat 报 `Request failed: connection refused`

主服务未启动或端口不匹配。确认 `go run cmd/nuka/main.go` 正在运行，且 CLI Chat 的 `-server` 参数与服务端口一致（默认 3210）。

### Q: 发送消息后返回 "No agent matched"

系统中注册了多个 Agent 但消息未指定目标。使用 `@AgentName` 前缀指定 Agent，或使用 `/agents` 查看可用 Agent 列表。

### Q: Neo4j/Redis 未启动会影响什么？

- 无 Neo4j：Agent 记忆功能不可用，但对话正常
- 无 Redis：团队协作调度不可用，单 Agent 对话正常
- 无 PostgreSQL：Agent 不会持久化，重启后需重新创建
