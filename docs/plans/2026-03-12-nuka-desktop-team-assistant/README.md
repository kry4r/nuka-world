# Nuka Desktop Team Assistant Roadmap

Date: 2026-03-12

## Objective

Build `Nuka`, described as `your desktop team assistant`, as a desktop-first multi-agent product that can cover real work and life responsibilities without introducing alternate control planes, mock implementations, or compatibility residue.

This roadmap converts the current hard-cut runtime into the next product phase using the existing desktop app, existing Tauri commands, and current Rust runtime as the only valid starting points.

## Fixed Product Constraints

- Desktop is the only control plane.
- Foundational resources are created, configured, and governed on desktop only.
- `Chat` remains the primary session and run execution surface.
- `Team` remains the persistent template management surface.
- `Agents` remains the primary creation and editing surface for agents.
- Slack and Discord may carry full session interaction and run follow-up, but they are channel attachments to desktop-owned sessions and never alternate control planes.
- Agent archetypes must remain open-ended and must not be constrained to software-only roles.
- No mock implementations are allowed in product code, tests, demos, or verification flows.
- Backend changes must optimize runtime efficiency and token usage, even when that requires large refactors.
- Frontend changes must stay concise, clean, and visually disciplined, with minimal helper copy.
- Every roadmap task must map back to current code, current backend capabilities, and current desktop pages.
- Every phase gate requires full Tauri MCP validation and explicit code cleanup before the next phase starts.

## Current Code Anchors

### Desktop pages

- `apps/desktop/src/features/chat/ChatPage.tsx`
- `apps/desktop/src/features/team/TeamPage.tsx`
- `apps/desktop/src/features/agents/AgentsPage.tsx`
- `apps/desktop/src/features/memory/MemoryPage.tsx`
- `apps/desktop/src/features/knowledge/KnowledgePage.tsx`
- `apps/desktop/src/features/settings/SettingsPage.tsx`

### Tauri command surfaces

- `apps/desktop/src-tauri/src/commands/chat.rs`
- `apps/desktop/src-tauri/src/commands/team.rs`
- `apps/desktop/src-tauri/src/commands/agents.rs`
- `apps/desktop/src-tauri/src/commands/workspace.rs`
- `apps/desktop/src-tauri/src/commands/settings.rs`
- `apps/desktop/src-tauri/src/commands/providers.rs`
- `apps/desktop/src-tauri/src/commands/memory.rs`
- `apps/desktop/src-tauri/src/commands/knowledge.rs`

### Runtime and persistence anchors

- `crates/nuka-runtime/src/chat_service.rs`
- `crates/nuka-runtime/src/team_service.rs`
- `crates/nuka-runtime/src/team_run_service.rs`
- `crates/nuka-runtime/src/workspace_sessions.rs`
- `crates/nuka-runtime/src/memory_service.rs`
- `crates/nuka-runtime/src/knowledge_service.rs`
- `crates/nuka-runtime/src/workflow.rs`
- `crates/nuka-runtime/src/world.rs`
- `crates/nuka-storage/src/providers.rs`
- `crates/nuka-storage/src/teams.rs`
- `crates/nuka-storage/src/team_runs.rs`

## Why This Roadmap Exists

The hard-cut work established the right execution center, but the codebase still contains workflow-shaped residue, thin channel abstractions, limited run governance, and agent modeling that still reads too much like a software-only assistant.

The next stage is not a greenfield redesign. It is a constrained evolution of the current app into a desktop control plane that can supervise broader agent work, retain long-lived session context, expose reliable observability, and safely extend interaction into Slack and Discord without shifting authority away from desktop.

## Product Themes Borrowed From Reference Projects

The product direction should borrow patterns, not branding or surface imitation, from nearby projects.

- `crush`: session continuity, operator-first ergonomics, prompt-centric workflows, and low-friction command execution.
- `openclaw`: multi-agent work orchestration, run-centric progress visibility, and practical runtime supervision.
- `ironclaw`: structured operational governance, channel-aware runtime management, and production-grade policy thinking.

These references should only influence implementation when the resulting feature can be anchored to the current Nuka desktop codebase.

## Phase Layout

### P0: Desktop control plane foundation

P0 completes the desktop-first team assistant core and removes the remaining structural blockers.

Included outcomes:

- broaden agent archetypes from fixed software roles into open-ended role kits that can represent work, household, trading, research, operations, and other real domains
- remove remaining workflow-shaped routing and runtime residue from `chat.rs`, `world.rs`, and adjacent compatibility surfaces
- add non-interactive prompt-to-result execution with structured JSON output through desktop-owned runtime entry points
- add session auto-compaction so long-lived conversations can summarize forward instead of degrading context quality
- add session snapshots and branching from existing chat and team run history
- add external-editor composition for long prompts before dispatch
- add file-change timeline visibility for each run, using current run and workspace state as the source of truth
- add session-level provider selection with runtime failover rules still governed by desktop settings
- add run queue and basic run recovery visibility inside `Chat`
- evolve `Settings` toward a lean diagnostics and routing surface rather than a copy-heavy control dump
- enforce zero-mock verification against real desktop flows and real providers

### P1: Governance, channels, and reusable operations

P1 expands the core with policy, versioning, and channel continuation while preserving desktop ownership.

Included outcomes:

- team template versioning and assignment diff previews
- per-agent provider overrides, permission budgets, and tool budgets
- reusable team charters and team playbooks
- Slack and Discord channel attachments with full session follow-up, but desktop-owned configuration and governance
- tool registry, installation, authorization, health checks, and audit flows
- approval strategy center and richer security controls
- memory retention policy, explainability, and workspace-level knowledge packs
- session archive and retrieval across older runs
- run-level cost, duration, and round statistics

### P2: Platform maturity and operational depth

P2 focuses on scale, resilience, and long-horizon operator productivity.

Included outcomes:

- onboarding, doctor, diagnostics, and crash recovery polish
- background service and update channel management
- mobile companion and notification relay tied back to desktop-owned sessions
- hybrid search and richer memory graph visualization
- live event console, run replay, trace export, provider dashboards, and bug-report bundles
- advanced sandbox layering and outbound network allowlists
- secret leak detection and stronger prompt-injection defense
- webhook, email-style inbox, web share, and broader async channel patterns when they can be mapped safely to the desktop core

## Feature Backlog Mapping

The current backlog is intentionally broad. It should be scheduled by dependency, not by theme alone.

### P0 backlog

- non-interactive mode with prompt input and JSON result output
- session auto-compaction
- session snapshot and branch continuation
- external editor support for long prompts
- file change timeline for a run
- session-level model switching and provider failover
- named commands and parameterized macros when backed by existing command routing
- run queue view
- run recovery panel with retry and checkpoint resume hooks on current run state
- multi-run isolation hardening for logs, tool calls, and memory writes
- stuck-run detection and recovery hooks
- archetype expansion across broader life and work domains
- remaining workflow route removal and cleanup

### P1 backlog

- session archive and retrieval
- run-level cost, duration, and round metrics
- team template versioning
- assignment diff preview
- per-agent provider override
- per-agent permission budget
- per-agent tool budget and rate limit
- agent fallback chains
- team charter library
- reusable team playbooks
- MCP registry and UI
- custom tool registry
- tool call audit flow
- tool dry-run mode
- tool capability labels
- memory retention policy
- memory explainability
- workspace-level knowledge packs
- memory write approval policy
- Slack and Discord full follow-up channels

### P2 backlog

- dynamic tool construction from natural-language specifications
- tool sandbox layering across local shell, MCP, and stronger isolation boundaries
- outbound allowlists
- secret leak detection
- prompt injection defense layers
- approval policy center across team, agent, tool, and workspace scopes
- full audit log export
- pairing or dual-confirmation for sensitive actions
- hybrid search with reranking
- identity and profile memory
- richer memory graph visualization
- webhook channel
- Telegram channel
- email-style async inbox
- web chat share link
- voice input and talk mode
- mobile companion and notification relay
- onboarding wizard
- doctor and diagnostics page
- daemon mode
- stable, beta, and dev update channels
- crash recovery and last-workspace recovery
- tray quick actions and global shortcuts
- live event console
- structured run trace export
- provider latency and error dashboard
- per-tool success rate
- run replay
- bug report bundle export

## Multi-Agent Delivery Model

The implementation process for these phases should itself run as a coordinated multi-agent program.

### Coordinator

- owns the approved design and phase documents
- assigns non-overlapping file scopes
- enforces cleanup before phase closure
- runs final verification and merge decisions

### Runtime track

- evolves Rust runtime, Tauri command surfaces, persistence, and efficiency rules
- removes dead code and compatibility residue instead of layering on adapters
- proves that token and latency behavior improved or stayed bounded

### Desktop UX track

- evolves the current desktop pages with strict minimal-copy UI rules
- uses the required frontend design skills during implementation
- keeps controls where the action actually happens instead of adding explanatory noise

### Verification track

- builds no-mock verification coverage around real Tauri MCP flows
- validates phase exit criteria against a real desktop app build
- performs SQLite audits, session recovery checks, and security assertions

No two tracks should edit the same file concurrently. If a task cannot be partitioned cleanly, it remains sequential under the coordinator.

## Phase Exit Gates

A phase is not complete because code compiles or unit tests pass. A phase is complete only when all of the following are true.

- the scoped implementation tasks for that phase are complete
- dead code and obsolete compatibility paths are removed
- Codex performs an explicit cleanup pass on touched modules
- the documented verification suite for that phase has been run fresh
- the desktop app is started and exercised through Tauri MCP
- the full user flow for that phase passes through real UI interaction
- no mock provider, mock runtime, or fake verification shortcut was used
- SQLite and other local state stores have been audited for forbidden plaintext secrets
- phase documentation has been updated to match the verified product state

## Documentation Set

This roadmap is split into one overview, one design document, and one implementation document per priority phase.

- `docs/plans/2026-03-12-nuka-desktop-team-assistant/README.md`
- `docs/plans/2026-03-12-nuka-desktop-team-assistant/design.md`
- `docs/plans/2026-03-12-nuka-desktop-team-assistant/p0/implementation.md`
- `docs/plans/2026-03-12-nuka-desktop-team-assistant/p1/implementation.md`
- `docs/plans/2026-03-12-nuka-desktop-team-assistant/p2/implementation.md`

The documents below must be treated as execution inputs, not idea dumps. Each implementation task must remain traceable to current code before any phase work begins.
