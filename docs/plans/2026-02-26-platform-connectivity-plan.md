# Platform Connectivity & Interactive Testing Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable interactive agent chat via CLI, fix Slack/Discord connectivity with proper diagnostics, and secure hardcoded tokens.

**Architecture:** Bottom-up approach — secure tokens first, then add observability (Status interface + diagnostics endpoint), then startup verification for Slack/Discord, then the CLI chat tool, and finally the port change. Each task is independently testable.

**Tech Stack:** Go, chi router, slack-go/slack, bwmarrin/discordgo, bufio (CLI REPL)

---

### Task 1: Token Security — Move Hardcoded Tokens to Env Vars

**Files:**
- Modify: `configs/nuka.json`
- Modify: `.env`
- Modify: `.env.example`

**Step 1: Replace hardcoded tokens in `configs/nuka.json`**

Replace the `gateway` section (lines 31-39) with env var references:

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

Also replace the hardcoded xfyun API key (line 27) with an env var:

```json
{
  "id": "xfyun",
  "type": "openai",
  "name": "讯飞星辰MaaS",
  "endpoint": "https://maas-api.cn-huabei-1.xf-yun.com/v2",
  "api_key": "${XFYUN_API_KEY}"
}
```

**Step 2: Add tokens to `.env`**

Append to `.env`:

```
# Gateway Tokens
SLACK_BOT_TOKEN=xoxb-your-bot-token
SLACK_APP_TOKEN=xapp-your-app-token
DISCORD_BOT_TOKEN=your-discord-bot-token

# 讯飞星辰MaaS
XFYUN_API_KEY=your-xfyun-api-key
```

**Step 3: Add placeholders to `.env.example`**

Append to `.env.example`:

```
# Gateway Tokens
SLACK_BOT_TOKEN=
SLACK_APP_TOKEN=
DISCORD_BOT_TOKEN=

# 讯飞星辰MaaS
XFYUN_API_KEY=
```

**Step 4: Verify config still loads**

Run: `go build ./cmd/nuka/...`
Expected: PASS — compiles cleanly. The `config.Load()` function already handles `${VAR}` substitution via regex.

**Step 5: Commit**

```bash
git add configs/nuka.json .env.example
git commit -m "security: move hardcoded tokens to env vars"
```

Note: Do NOT commit `.env` — it contains real secrets. Verify `.gitignore` includes `.env`.

---

### Task 2: Gateway Diagnostics — AdapterStatus Type + Interface Extension

**Files:**
- Modify: `internal/gateway/types.go`

**Step 1: Add `AdapterStatus` struct and extend `GatewayAdapter` interface**

Add after the `BroadcastMessage` struct (after line 59):

```go
// AdapterStatus reports the runtime state of a gateway adapter.
type AdapterStatus struct {
	Platform    string     `json:"platform"`
	Connected   bool       `json:"connected"`
	ConnectedAt *time.Time `json:"connected_at,omitempty"`
	Error       string     `json:"error,omitempty"`
	Details     string     `json:"details,omitempty"`
}
```

Add `Status() AdapterStatus` to the `GatewayAdapter` interface (line 16, before `Close()`):

```go
type GatewayAdapter interface {
	Platform() string
	Connect(ctx context.Context) error
	Send(ctx context.Context, msg *OutboundMessage) error
	OnMessage(handler MessageHandler)
	Broadcast(ctx context.Context, msg *BroadcastMessage) error
	Status() AdapterStatus
	Close() error
}
```

**Step 2: Verify compilation fails (adapters don't implement Status yet)**

Run: `go build ./...`
Expected: FAIL — `SlackAdapter`, `DiscordAdapter`, `RESTAdapter` don't implement `Status()`.

**Step 3: Commit**

```bash
git add internal/gateway/types.go
git commit -m "feat(gateway): add AdapterStatus type and Status() to interface"
```

---

### Task 3: Gateway Diagnostics — Implement Status() on All Adapters

**Files:**
- Modify: `internal/gateway/rest.go`
- Modify: `internal/gateway/slack.go`
- Modify: `internal/gateway/discord.go`

**Step 1: Add `Status()` to RESTAdapter**

Append to `internal/gateway/rest.go` (after `Close()` on line 38):

```go
func (a *RESTAdapter) Status() AdapterStatus {
	return AdapterStatus{
		Platform:  "rest",
		Connected: true,
		Details:   "ready",
	}
}
```

**Step 2: Add connection tracking fields + `Status()` to SlackAdapter**

In `internal/gateway/slack.go`, add fields to the `SlackAdapter` struct (after `logger` field, line 32):

```go
	connected   bool
	connectedAt time.Time
	lastError   string
```

Add `Status()` method at the end of the file:

```go
func (a *SlackAdapter) Status() AdapterStatus {
	a.mu.RLock()
	defer a.mu.RUnlock()
	s := AdapterStatus{
		Platform:  "slack",
		Connected: a.connected,
		Error:     a.lastError,
	}
	if a.connected {
		t := a.connectedAt
		s.ConnectedAt = &t
	}
	return s
}
```

**Step 3: Add connection tracking fields + `Status()` to DiscordAdapter**

In `internal/gateway/discord.go`, add fields to the `DiscordAdapter` struct (after `logger` field, line 20):

```go
	connected   bool
	connectedAt time.Time
	lastError   string
```

Add `Status()` method at the end of the file:

```go
func (a *DiscordAdapter) Status() AdapterStatus {
	a.mu.RLock()
	defer a.mu.RUnlock()
	s := AdapterStatus{
		Platform:  "discord",
		Connected: a.connected,
		Error:     a.lastError,
	}
	if a.connected {
		t := a.connectedAt
		s.ConnectedAt = &t
	}
	return s
}
```

**Step 4: Verify compilation passes**

Run: `go build ./...`
Expected: PASS — all adapters now implement the full `GatewayAdapter` interface.

**Step 5: Commit**

```bash
git add internal/gateway/rest.go internal/gateway/slack.go internal/gateway/discord.go
git commit -m "feat(gateway): implement Status() on all adapters"
```

---

### Task 4: Gateway Diagnostics — StatusAll() + API Endpoint

**Files:**
- Modify: `internal/gateway/gateway.go`
- Modify: `internal/api/handler.go`

**Step 1: Add `StatusAll()` to Gateway**

Append to `internal/gateway/gateway.go` (after `Adapters()` method, line 127):

```go
// StatusAll returns the status of all registered adapters.
func (g *Gateway) StatusAll() []AdapterStatus {
	g.mu.RLock()
	defer g.mu.RUnlock()
	statuses := make([]AdapterStatus, 0, len(g.adapters))
	for _, adapter := range g.adapters {
		statuses = append(statuses, adapter.Status())
	}
	return statuses
}
```

**Step 2: Add `gateway` field to Handler struct**

In `internal/api/handler.go`, add a `gw` field to the `Handler` struct (after `restGW`, line 26):

```go
	gw          *gateway.Gateway
```

Update `NewHandler` signature to accept `*gateway.Gateway`:

```go
func NewHandler(
	engine *agent.Engine,
	store *memory.Store,
	steward *orchestrator.Steward,
	broadcaster *gateway.Broadcaster,
	restGW *gateway.RESTAdapter,
	gw *gateway.Gateway,
	clock *world.WorldClock,
	scheduleMgr *world.ScheduleManager,
	stateMgr *world.StateManager,
	growth *world.GrowthTracker,
	heartbeat *world.Heartbeat,
	logger *zap.Logger,
) *Handler {
```

And set it in the return:

```go
	return &Handler{
		engine:      engine,
		memoryStore: store,
		steward:     steward,
		broadcaster: broadcaster,
		restGW:      restGW,
		gw:          gw,
		clock:       clock,
		...
	}
```

**Step 3: Add `GET /api/gateway/status` route and handler**

In `handler.go`, add the route inside the `/api` route group (after line 127, the `r.Get("/adapters"...)` line):

```go
		r.Get("/gateway/status", h.gatewayStatus)
```

Add the handler method:

```go
func (h *Handler) gatewayStatus(w http.ResponseWriter, r *http.Request) {
	if h.gw == nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "gateway not initialized"})
		return
	}
	statuses := h.gw.StatusAll()
	writeJSON(w, http.StatusOK, statuses)
}
```

**Step 4: Update `main.go` to pass `gw` to `NewHandler`**

In `cmd/nuka/main.go`, update the `NewHandler` call (line 202) to include `gw`:

```go
handler := api.NewHandler(engine, store, steward, broadcaster, restAdapter, gw, clock, scheduleMgr, stateMgr, growthTracker, heartbeat, logger)
```

**Step 5: Verify compilation**

Run: `go build ./...`
Expected: PASS.

**Step 6: Commit**

```bash
git add internal/gateway/gateway.go internal/api/handler.go cmd/nuka/main.go
git commit -m "feat(gateway): add StatusAll() and GET /api/gateway/status endpoint"
```

---

### Task 5: Startup Connection Verification — Slack AuthTest

**Files:**
- Modify: `internal/gateway/slack.go`

**Step 1: Add AuthTest verification to Slack `Connect()` method**

Replace the current `Connect` method (lines 70-79) with:

```go
// Connect starts the Socket Mode event loop and verifies the connection via AuthTest.
func (a *SlackAdapter) Connect(ctx context.Context) error {
	go a.handleEvents(ctx)
	go func() {
		if err := a.socket.RunContext(ctx); err != nil {
			a.logger.Error("slack socket mode error", zap.Error(err))
			a.mu.Lock()
			a.lastError = err.Error()
			a.connected = false
			a.mu.Unlock()
		}
	}()

	// Verify connection with AuthTest
	resp, err := a.client.AuthTestContext(ctx)
	if err != nil {
		a.mu.Lock()
		a.lastError = fmt.Sprintf("AuthTest failed: %v", err)
		a.connected = false
		a.mu.Unlock()
		a.logger.Error("slack AuthTest failed — check bot token",
			zap.Error(err))
		return fmt.Errorf("slack auth test: %w", err)
	}

	now := time.Now()
	a.mu.Lock()
	a.connected = true
	a.connectedAt = now
	a.lastError = ""
	a.mu.Unlock()

	a.logger.Info("slack adapter connected via socket mode",
		zap.String("bot", resp.User),
		zap.String("team", resp.Team),
		zap.String("url", resp.URL))
	return nil
}
```

**Step 2: Update Status() to include bot details**

Replace the `Status()` method with:

```go
func (a *SlackAdapter) Status() AdapterStatus {
	a.mu.RLock()
	defer a.mu.RUnlock()
	s := AdapterStatus{
		Platform:  "slack",
		Connected: a.connected,
		Error:     a.lastError,
	}
	if a.connected {
		t := a.connectedAt
		s.ConnectedAt = &t
		s.Details = fmt.Sprintf("bot connected at %s", a.connectedAt.Format(time.RFC3339))
	}
	return s
}
```

**Step 3: Verify compilation**

Run: `go build ./...`
Expected: PASS.

**Step 4: Commit**

```bash
git add internal/gateway/slack.go
git commit -m "feat(slack): add AuthTest verification on Connect()"
```

---

### Task 6: Startup Connection Verification — Discord Guild Check

**Files:**
- Modify: `internal/gateway/discord.go`

**Step 1: Add guild check and connection tracking to Discord `Connect()` method**

Replace the current `Connect` method (lines 52-68) with:

```go
// Connect opens the Discord gateway websocket and verifies guild membership.
func (a *DiscordAdapter) Connect(_ context.Context) error {
	session, err := discordgo.New("Bot " + a.token)
	if err != nil {
		a.mu.Lock()
		a.lastError = fmt.Sprintf("session create: %v", err)
		a.mu.Unlock()
		return fmt.Errorf("discord session: %w", err)
	}
	a.session = session

	a.session.Identify.Intents = discordgo.IntentsGuildMessages | discordgo.IntentsDirectMessages
	a.session.AddHandler(a.onMessageCreate)

	if err := a.session.Open(); err != nil {
		a.mu.Lock()
		a.lastError = fmt.Sprintf("open failed: %v", err)
		a.connected = false
		a.mu.Unlock()
		return fmt.Errorf("discord open: %w", err)
	}

	now := time.Now()
	a.mu.Lock()
	a.connected = true
	a.connectedAt = now
	a.lastError = ""
	a.mu.Unlock()

	// Log guild count
	guildCount := len(a.session.State.Guilds)
	if guildCount == 0 {
		a.logger.Warn("discord bot not added to any server — invite it first")
	}

	a.logger.Info("discord adapter connected",
		zap.String("user", a.session.State.User.Username),
		zap.Int("guilds", guildCount))
	return nil
}
```

**Step 2: Update Status() to include bot details**

Replace the `Status()` method with:

```go
func (a *DiscordAdapter) Status() AdapterStatus {
	a.mu.RLock()
	defer a.mu.RUnlock()
	s := AdapterStatus{
		Platform:  "discord",
		Connected: a.connected,
		Error:     a.lastError,
	}
	if a.connected {
		t := a.connectedAt
		s.ConnectedAt = &t
		guildCount := 0
		if a.session != nil && a.session.State != nil {
			guildCount = len(a.session.State.Guilds)
		}
		s.Details = fmt.Sprintf("bot=%s, guilds=%d",
			a.session.State.User.Username, guildCount)
	}
	return s
}
```

**Step 3: Add `"time"` to imports if not already present**

In `internal/gateway/discord.go`, ensure `"time"` is in the import block.

**Step 4: Verify compilation**

Run: `go build ./...`
Expected: PASS.

**Step 5: Commit**

```bash
git add internal/gateway/discord.go
git commit -m "feat(discord): add guild check and connection tracking on Connect()"
```

---

### Task 7: CLI Chat Tool

**Files:**
- Create: `cmd/chat/main.go`

**Step 1: Create `cmd/chat/` directory and `main.go`**

```go
package main

import (
	"bufio"
	"bytes"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"
)

func main() {
	server := flag.String("server", "http://localhost:3210", "Nuka World server URL")
	user := flag.String("user", "cli-user", "User name for chat")
	flag.Parse()

	fmt.Println("Nuka World CLI Chat")
	fmt.Printf("Server: %s | User: %s\n", *server, *user)
	fmt.Println("Type 'exit' or 'quit' to leave. Use @AgentName or @team-Name to route.")
	fmt.Println("---")

	// Fetch available agents
	fetchAgents(*server)

	scanner := bufio.NewScanner(os.Stdin)
	for {
		fmt.Print("\n> ")
		if !scanner.Scan() {
			break
		}
		input := strings.TrimSpace(scanner.Text())
		if input == "" {
			continue
		}
		if input == "exit" || input == "quit" {
			fmt.Println("Bye!")
			return
		}
		if input == "/status" {
			fetchStatus(*server)
			continue
		}
		if input == "/agents" {
			fetchAgents(*server)
			continue
		}

		sendMessage(*server, *user, input)
	}
}

func fetchAgents(server string) {
	resp, err := http.Get(server + "/api/agents")
	if err != nil {
		printError("Failed to fetch agents: %v", err)
		return
	}
	defer resp.Body.Close()

	var agents []struct {
		Persona struct {
			ID   string `json:"id"`
			Name string `json:"name"`
			Role string `json:"role"`
		} `json:"persona"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&agents); err != nil {
		printError("Failed to parse agents: %v", err)
		return
	}
	if len(agents) == 0 {
		fmt.Println("No agents registered yet.")
		return
	}
	fmt.Println("Available agents:")
	for _, a := range agents {
		fmt.Printf("  @%s (%s)\n", a.Persona.Name, a.Persona.Role)
	}
}

func fetchStatus(server string) {
	resp, err := http.Get(server + "/api/gateway/status")
	if err != nil {
		printError("Failed to fetch status: %v", err)
		return
	}
	defer resp.Body.Close()

	var statuses []struct {
		Platform    string  `json:"platform"`
		Connected   bool    `json:"connected"`
		ConnectedAt *string `json:"connected_at,omitempty"`
		Error       string  `json:"error,omitempty"`
		Details     string  `json:"details,omitempty"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&statuses); err != nil {
		printError("Failed to parse status: %v", err)
		return
	}
	fmt.Println("Gateway Status:")
	for _, s := range statuses {
		icon := "\033[31m✗\033[0m"
		if s.Connected {
			icon = "\033[32m✓\033[0m"
		}
		fmt.Printf("  %s %s", icon, s.Platform)
		if s.Details != "" {
			fmt.Printf(" — %s", s.Details)
		}
		if s.Error != "" {
			fmt.Printf(" \033[31m(%s)\033[0m", s.Error)
		}
		fmt.Println()
	}
}
```

**Step 2: Add `sendMessage` and `printError` functions (same file, append)**

```go
func sendMessage(server, user, content string) {
	body, _ := json.Marshal(map[string]string{
		"user_id":   user,
		"user_name": user,
		"content":   content,
	})

	client := &http.Client{Timeout: 65 * time.Second}
	resp, err := client.Post(
		server+"/api/gateway/rest/message",
		"application/json",
		bytes.NewReader(body),
	)
	if err != nil {
		printError("Request failed: %v", err)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		data, _ := io.ReadAll(resp.Body)
		printError("Server error (%d): %s", resp.StatusCode, string(data))
		return
	}

	var msg struct {
		AgentID string `json:"agent_id"`
		Content string `json:"content"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&msg); err != nil {
		printError("Failed to parse response: %v", err)
		return
	}

	// Color-coded output: agent name in cyan
	if msg.AgentID != "" {
		fmt.Printf("\033[36m[%s]\033[0m %s\n", msg.AgentID, msg.Content)
	} else {
		fmt.Println(msg.Content)
	}
}

func printError(format string, args ...interface{}) {
	fmt.Fprintf(os.Stderr, "\033[31m"+format+"\033[0m\n", args...)
}
```

**Step 3: Verify compilation**

Run: `go build ./cmd/chat/...`
Expected: PASS — standalone binary compiles.

**Step 4: Commit**

```bash
git add cmd/chat/main.go
git commit -m "feat: add CLI chat tool for interactive agent testing"
```

---

### Task 8: Port Change — 8080 → 3210

**Files:**
- Modify: `configs/nuka.json`
- Modify: `.env`

**Step 1: Update port in `configs/nuka.json`**

Change line 3 from:

```json
"port": 8080,
```

to:

```json
"port": 3210,
```

**Step 2: Update port in `.env`**

Change line 2 from:

```
PORT=8080
```

to:

```
PORT=3210
```

**Step 3: Verify server starts on new port**

Run: `go build ./cmd/nuka/... && echo "Build OK"`
Expected: PASS.

**Step 4: Commit**

```bash
git add configs/nuka.json
git commit -m "chore: change default server port to 3210"
```

---

### Task Summary

| Task | Component | What |
|------|-----------|------|
| 1 | Security | Move hardcoded tokens to env vars |
| 2 | Gateway | Add `AdapterStatus` type + `Status()` to interface |
| 3 | Gateway | Implement `Status()` on REST, Slack, Discord adapters |
| 4 | Gateway | Add `StatusAll()` + `GET /api/gateway/status` endpoint |
| 5 | Slack | Add AuthTest verification on `Connect()` |
| 6 | Discord | Add guild check + connection tracking on `Connect()` |
| 7 | CLI | Create `cmd/chat/main.go` interactive REPL |
| 8 | Config | Change default port to 3210 |

---

### Manual Testing

**Start the server:**
```bash
go run ./cmd/nuka/...
```

**Check gateway status:**
```bash
curl http://localhost:3210/api/gateway/status | jq
```

**Use CLI chat:**
```bash
go run ./cmd/chat/... --server http://localhost:3210
```

CLI commands:
- `/status` — show gateway adapter status
- `/agents` — list available agents
- `@AgentName message` — route to specific agent
- `@team-Name message` — route to team
- `exit` / `quit` — leave
