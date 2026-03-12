# P1 Implementation

Date: 2026-03-12

## Phase Goal

Expand the P0 desktop control plane into a governed multi-agent operating environment with versioned teams, reusable operating patterns, channel continuation, and richer policy controls, while keeping desktop as the only place where durable authority lives.

## Mandatory Execution Rules

- P1 cannot start until P0 has passed its documented Tauri MCP flow and cleanup gate.
- All tasks remain anchored to current pages, commands, and runtime modules.
- No mock channels, fake audit trails, or synthetic policy paths are allowed.
- Slack and Discord work must extend desktop-owned sessions and runs rather than creating parallel state models.
- Each task must delete obsolete interim code before the phase closes.

## Current Code Anchors For P1

### Desktop

- `apps/desktop/src/features/chat/**`
- `apps/desktop/src/features/team/**`
- `apps/desktop/src/features/agents/**`
- `apps/desktop/src/features/memory/**`
- `apps/desktop/src/features/knowledge/**`
- `apps/desktop/src/features/settings/**`

### Tauri and runtime

- `apps/desktop/src-tauri/src/commands/chat.rs`
- `apps/desktop/src-tauri/src/commands/team.rs`
- `apps/desktop/src-tauri/src/commands/agents.rs`
- `apps/desktop/src-tauri/src/commands/memory.rs`
- `apps/desktop/src-tauri/src/commands/knowledge.rs`
- `apps/desktop/src-tauri/src/commands/settings.rs`
- `crates/nuka-runtime/src/team_service.rs`
- `crates/nuka-runtime/src/team_run_service.rs`
- `crates/nuka-runtime/src/memory_service.rs`
- `crates/nuka-runtime/src/knowledge_service.rs`
- `crates/nuka-runtime/src/workspace_sessions.rs`
- `crates/nuka-storage/src/teams.rs`
- `crates/nuka-storage/src/team_runs.rs`
- `crates/nuka-storage/src/memory.rs`
- `crates/nuka-storage/src/knowledge.rs`

## Scope

P1 covers the following product outcomes.

- team template versioning
- assignment diff preview before launch
- per-agent provider override
- per-agent permission budget
- per-agent tool budget and rate limit
- agent fallback chains
- team charter library
- reusable team playbooks
- Slack and Discord continuation channels
- MCP registry and UI
- custom tool registry
- tool call audit flow
- tool dry-run mode
- tool capability labels
- session archive and retrieval
- run-level cost, duration, and round metrics
- memory retention policy
- memory explainability
- workspace-level knowledge packs
- memory write approval strategy

## Parallel Delivery Layout

### Coordinator

- maintains shared versioning and governance contracts
- sequences channel work after the desktop-owned authority model is proven
- owns final end-to-end verification and documentation updates

### Track A: Team governance and run policy

Primary files:

- `crates/nuka-runtime/src/team_service.rs`
- `crates/nuka-runtime/src/team_run_service.rs`
- `crates/nuka-storage/src/teams.rs`
- `crates/nuka-storage/src/team_runs.rs`
- `apps/desktop/src/features/team/**`
- `apps/desktop/src/features/chat/**`

### Track B: Tooling, providers, and channel attachments

Primary files:

- `apps/desktop/src-tauri/src/commands/settings.rs`
- `apps/desktop/src-tauri/src/commands/chat.rs`
- `apps/desktop/src/features/settings/**`
- `apps/desktop/src/features/chat/**`
- runtime provider and tool modules introduced or extended in P0

### Track C: Memory, knowledge, and archive surfaces

Primary files:

- `apps/desktop/src/features/memory/**`
- `apps/desktop/src/features/knowledge/**`
- `crates/nuka-runtime/src/memory_service.rs`
- `crates/nuka-runtime/src/knowledge_service.rs`
- `crates/nuka-storage/src/memory.rs`
- `crates/nuka-storage/src/knowledge.rs`
- `crates/nuka-runtime/src/workspace_sessions.rs`

## Task Breakdown

### Task 1: Version team templates and show assignment diffs

Intent:

Make team evolution legible and reviewable before runs start.

Changes:

- persist team versions in `crates/nuka-storage/src/teams.rs`
- expose diff summaries for assignment and policy changes in `crates/nuka-runtime/src/team_service.rs`
- render version history and launch-time diffs in `apps/desktop/src/features/team/**`

Done when:

- a user can see what changed between the current team template and the last launched or saved version

### Task 2: Add per-agent provider, permission, and tool budgets

Intent:

Move from team-wide coarse controls to agent-specific runtime governance.

Changes:

- extend agent assignment records with provider override, permission budget, and tool budget fields
- enforce those budgets inside `crates/nuka-runtime/src/team_run_service.rs`
- expose concise controls in `Team` and `Agents`

Done when:

- an assigned agent can run under tighter or different limits than the rest of the team

### Task 3: Add agent fallback chains

Intent:

Let runtime execution degrade deterministically instead of failing open or retrying blindly.

Changes:

- add fallback chain configuration to agents or assignments
- enforce fallback resolution in runtime provider selection
- surface the effective chain in the run view and agent editor

Done when:

- a failed primary model or provider can fall back according to a desktop-defined policy path

### Task 4: Add charter library and reusable playbooks

Intent:

Turn repeated team coordination patterns into reusable desktop-owned operating assets.

Changes:

- add charter templates anchored to current team constraints and success-criteria structures
- add playbooks that preconfigure team execution patterns without bypassing team review
- surface them in `Team` and `Chat` run start flows

Done when:

- users can start from a reusable charter or playbook and still inspect the resulting team state before launch

### Task 5: Add session archive and retrieval

Intent:

Make older work discoverable without polluting the active tab surface.

Changes:

- add archive projections and retrieval queries to `crates/nuka-runtime/src/workspace_sessions.rs`
- expose archive access from the current `Chat` page rather than adding a new control plane

Done when:

- archived runs and chats can be searched and reopened into active desktop tabs

### Task 6: Add run-level metrics

Intent:

Give operators a concise view of what a run cost and how it behaved.

Changes:

- persist cost, duration, and round metrics in current run records
- render metrics in `Chat` or run detail surfaces without turning the UI into a dashboard wall

Done when:

- each run exposes readable metrics for cost, duration, and round count

### Task 7: Add tool registry, audit, dry-run, and capability labels

Intent:

Turn tool usage into an inspectable and governable system.

Changes:

- introduce a tool registry anchored to current command and runtime execution paths
- classify tools by capability such as file read, file write, network, shell, or external API
- persist tool audit records with input summary, output summary, duration, and failure reason
- add dry-run support only where the underlying tool path can support a real no-side-effect mode

Done when:

- tool availability, health, and recent audit activity can be reviewed from desktop settings or related management surfaces

### Task 8: Add Slack and Discord continuation channels

Intent:

Extend active sessions into external channels without letting those channels become product authorities.

Changes:

- add channel attachment configuration in `Settings`
- bind channel attachments to existing session or run identifiers
- route inbound channel messages through current desktop-owned runtime services
- mirror outbound updates from active sessions back into the attached channel where policy allows

Done when:

- a desktop-owned session can continue in Slack or Discord and remain fully recoverable in the desktop app
- deleting or detaching the channel does not delete desktop session authority

### Task 9: Add memory governance and explainability

Intent:

Make memory durable, explainable, and reviewable rather than opaque.

Changes:

- add retention policy and approval state to current memory records
- expose why a memory was matched or surfaced
- allow workspace-level knowledge packs to participate in memory and retrieval decisions
- keep review actions flat and direct in the current desktop UI

Done when:

- operators can see why a memory mattered and decide whether it should remain short-term, long-term, or rejected

## Cleanup Expectations

The coordinator must remove temporary P1 scaffolding before phase closure.

Cleanup includes:

- deleting transition-only version adapters
- deleting debug-only channel plumbing that is not needed in production
- collapsing duplicated policy structs introduced during migration
- removing verbose helper copy from new governance surfaces

## Required P1 Verification

P1 must not close without these checks.

### Automated verification

- targeted tests for versioning, fallback chains, budget enforcement, archive retrieval, and tool audit persistence
- channel integration tests using real integration boundaries where available and no mocks for claimed real flows
- regression tests for team launch after version changes

### Tauri MCP verification

Run the real app and verify all of the following through desktop interaction.

- inspect a team version history and preview assignment diffs before launch
- launch a run and confirm agent-specific routing or budget constraints are visible in the run state
- open archived sessions and reactivate one into the active tab strip
- inspect tool audit output and capability labels from the desktop UI
- attach Slack or Discord to an existing session and verify a follow-up message round-trips back into desktop-owned history
- review memory retention actions and explainability details from the memory surface

### Cleanup and audit verification

- `git diff --check`
- explicit review that no channel path created an alternate source of truth outside desktop persistence
- security review for policy and approval surfaces touched in the phase

## Exit Criteria

P1 is complete only when:

- teams are versioned and launch diffs are visible
- agent-level budgets and fallback rules are enforced by runtime behavior
- sessions can continue through Slack or Discord while desktop remains authoritative
- tools and memory have visible governance and audit structures
- archived work can be retrieved without reopening legacy UI models
- the full P1 Tauri MCP flow passes on a real app build
