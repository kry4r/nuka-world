# Platform Connectivity & Interactive Testing Design

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:writing-plans to create the implementation plan from this design.

**Goal:** Enable interactive agent chat via CLI, fix Slack/Discord connectivity with proper diagnostics, and secure hardcoded tokens.

**Scope:** CLI chat tool, gateway diagnostics endpoint, adapter startup verification, token security.

---

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Interactive testing | CLI REPL via REST API | Fastest to build, no browser needed, works with existing REST adapter |
| Gateway observability | Status endpoint + startup verification | Instant visibility into adapter state without log digging |
| Token management | Env vars via existing `${VAR}` substitution | Already supported by `config.Load()`, zero new code |
| Server port | Non-standard (e.g. 3210) | Avoid conflicts with common services on 8080 |

---

## Architecture Overview

```
cmd/chat/main.go (CLI REPL)
    │
    ▼ HTTP POST
/api/gateway/rest/message
    │
    ▼
RESTAdapter → MessageRouter → Engine.Execute → Response
    │
    ▼
CLI displays response
```

Diagnostic flow:
```
GET /api/gateway/status
    │
    ▼
Gateway.StatusAll() → []{platform, status, error, connected_at}
```

---

## Component 1: CLI Chat Tool

**File:** `cmd/chat/main.go`

**Behavior:**
- On startup: connects to server, fetches `GET /api/agents` to list available agents
- REPL loop: reads user input → POST to `/api/gateway/rest/message` → display response
- Supports `@AgentName` mentions for agent routing and `@team-Name` for team routing
- Color-coded output: agent name in cyan, response in default, errors in red
- Flags: `--server` (default `http://localhost:3210`), `--user` (default `cli-user`)

**Key constraint:** The existing `RESTAdapter.handleMessage` creates a unique channelID per request and waits up to 60s for a response. The CLI just needs to POST JSON and read the response — no streaming or WebSocket needed.

**Exit:** Ctrl+C or typing `exit`/`quit`

---

## Component 2: Gateway Diagnostics Endpoint

**Changes:**
- Add `Status() AdapterStatus` to `GatewayAdapter` interface
- Each adapter tracks: `connected bool`, `connectedAt time.Time`, `lastError string`
- `Gateway.StatusAll() []AdapterStatus` iterates all adapters
- API handler: `GET /api/gateway/status` returns JSON array

**AdapterStatus struct:**
```go
type AdapterStatus struct {
    Platform    string     `json:"platform"`
    Connected   bool       `json:"connected"`
    ConnectedAt *time.Time `json:"connected_at,omitempty"`
    Error       string     `json:"error,omitempty"`
    Details     string     `json:"details,omitempty"` // e.g. bot username, guild count
}
```

**Per-adapter details:**
- REST: always connected, details = "ready"
- Slack: details = bot username + workspace name (from AuthTest)
- Discord: details = bot username + guild count

---

## Component 3: Startup Connection Verification

**Slack adapter (`Connect` method):**
- After `socket.RunContext` goroutine starts, call `client.AuthTest()` synchronously
- If AuthTest succeeds: log bot name, workspace, set `connected = true`
- If AuthTest fails: log ERROR with clear message, set `lastError`, return error
- This catches invalid tokens immediately instead of silently failing

**Discord adapter (`Connect` method):**
- After `session.Open()` succeeds (already verified), log guild count
- Add a brief delay then check `session.State.Guilds` length
- If 0 guilds: log WARN "bot not added to any server"
- Set connection status accordingly

---

## Component 4: Token Security

**Problem:** `configs/nuka.json` has Slack and Discord tokens hardcoded in plaintext.

**Fix:** Replace with env var references (already supported by `config.Load()`):

```json
"gateway": {
  "slack": {
    "enabled": true,
    "bot_token": "${SLACK_BOT_TOKEN}",
    "app_token": "${SLACK_APP_TOKEN}"
  },
  "discord": {
    "enabled": true,
    "bot_token": "${DISCORD_BOT_TOKEN}"
  }
}
```

**`.env` additions:**
```
SLACK_BOT_TOKEN=xoxb-...
SLACK_APP_TOKEN=xapp-...
DISCORD_BOT_TOKEN=MTQ2...
```

**`.env.example` additions:** Same keys with empty values.

---

## Server Port Change

Update default port from `8080` to `3210` in:
- `configs/nuka.json`: `"port": 3210`
- `.env`: `PORT=3210`
- CLI chat default: `--server http://localhost:3210`

---

## File Changes Summary

| Action | File |
|--------|------|
| Create | `cmd/chat/main.go` |
| Modify | `internal/gateway/types.go` — add `Status() AdapterStatus` to interface |
| Modify | `internal/gateway/gateway.go` — add `StatusAll()` |
| Modify | `internal/gateway/slack.go` — add AuthTest verification, Status() |
| Modify | `internal/gateway/discord.go` — add guild check, Status() |
| Modify | `internal/gateway/rest.go` — add Status() |
| Modify | `internal/api/handler.go` — add `GET /api/gateway/status` |
| Modify | `configs/nuka.json` — env var tokens, port change |
| Modify | `.env` — add Slack/Discord tokens, update port |
| Modify | `.env.example` — add Slack/Discord token placeholders |
