# P2 Implementation

Date: 2026-03-12

## Phase Goal

Take the verified desktop control plane from P0 and P1 and mature it into a resilient long-horizon platform with stronger security, broader channel options, richer observability, and better operator recovery flows.

P2 is where Nuka becomes operationally deep rather than only functionally complete.

## Mandatory Execution Rules

- P2 cannot start until P1 has passed its documented Tauri MCP flow and cleanup gate.
- Every P2 task must continue to anchor back to current desktop pages, runtime services, or their direct descendants from earlier phases.
- No speculative subsystem should be introduced unless the current codebase can host it cleanly.
- The desktop remains the only configuration and governance authority even as more channels and background capabilities are added.
- Security claims require explicit datastore, network, and runtime verification.

## Current Code Anchors For P2

By the time P2 starts, the active anchors should still be direct descendants of today's desktop and runtime layout.

Expected anchor families:

- `apps/desktop/src/features/chat/**`
- `apps/desktop/src/features/team/**`
- `apps/desktop/src/features/agents/**`
- `apps/desktop/src/features/memory/**`
- `apps/desktop/src/features/knowledge/**`
- `apps/desktop/src/features/settings/**`
- `apps/desktop/src-tauri/src/commands/**`
- `crates/nuka-runtime/src/**`
- `crates/nuka-storage/src/**`

## Scope

P2 covers the following product outcomes.

- dynamic tool construction from natural-language requirements
- layered tool sandboxing
- outbound allowlists
- secret leak detection
- prompt injection defense layers
- approval strategy center across workspace, team, agent, and tool scopes
- full audit log export
- pairing or dual-confirmation mode for sensitive actions
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
- update channel management
- crash recovery and last-workspace recovery
- tray quick actions and global shortcuts
- live event console
- structured run trace export
- provider latency and error dashboards
- per-tool success rate
- run replay
- bug report bundle export

## Parallel Delivery Layout

### Coordinator

- guards platform boundaries and cross-cutting security contracts
- coordinates sequencing for sandbox, observability, and background-service work
- owns final release readiness verification for the phase

### Track A: Security and policy platform

Primary focus:

- sandbox layering
- allowlists
- secret leak detection
- prompt injection defense
- approval strategy center
- pairing and dual-confirmation flows
- audit export

### Track B: Memory, search, and observability

Primary focus:

- hybrid search
- identity and profile memory
- graph visualization
- event console
- replay and trace export
- provider and tool performance views
- bug bundle export

### Track C: Desktop platform maturity and channel breadth

Primary focus:

- onboarding
- doctor and diagnostics
- daemon mode
- update channels
- crash recovery
- tray and hotkeys
- webhook, Telegram, email, web share, voice, and mobile relay paths

## Task Breakdown

### Task 1: Add layered sandboxing and outbound control

Intent:

Give the operator confidence that tools and network actions stay within policy.

Changes:

- classify and enforce tool execution boundaries for local shell, MCP, and stronger isolation environments
- add outbound allowlists at the workspace or settings level
- surface policy violations cleanly in run state and audit records

Done when:

- disallowed outbound targets and tool classes are blocked deterministically and explained through desktop-visible audit trails

### Task 2: Add secret leak and prompt-injection defenses

Intent:

Move from passive trust to active runtime defense.

Changes:

- scan request, response, and log boundaries for likely secret leakage
- classify external content and tool output before it affects runtime planning
- expose defense events in audit and run state surfaces

Done when:

- likely secret exposure and suspicious external instruction payloads are detectable, reviewable, and enforceable through policy

### Task 3: Add approval strategy center and pairing mode

Intent:

Centralize sensitive-operation governance instead of scattering approvals across pages.

Changes:

- add desktop-owned approval configuration by workspace, team, agent, and tool scope
- add dual-confirmation or pairing mode for sensitive operations
- reflect approval decisions in current run and audit views

Done when:

- sensitive actions are governed by one coherent desktop policy model and can require second-party confirmation where configured

### Task 4: Add hybrid search, profile memory, and richer graph views

Intent:

Make long-lived memory useful at larger scale without hiding why something was surfaced.

Changes:

- combine text retrieval with reranking over current memory and knowledge stores
- persist user and workspace profile memory with explicit visibility and controls
- improve the graph surface with node type, relation strength, and recent activity views

Done when:

- retrieval quality improves while the desktop still explains what matched and why

### Task 5: Add broader async and mobile channels

Intent:

Extend follow-up paths beyond Slack and Discord without diluting desktop authority.

Changes:

- add webhook, Telegram, email-style inbox, web share, voice, and mobile relay adapters as channel attachments
- keep all setup, permissions, and session authority on desktop

Done when:

- each additional channel continues an existing desktop-owned session and remains reviewable from the main app

### Task 6: Add desktop maturity flows

Intent:

Reduce operator friction during install, diagnostics, and restart.

Changes:

- onboarding wizard
- doctor and diagnostics page
- background service or daemon mode
- update channel controls
- crash recovery and last-workspace recovery
- tray quick actions and global shortcuts

Done when:

- the product can recover gracefully from normal desktop interruptions and expose actionable diagnostics from the desktop UI itself

### Task 7: Add deep observability and replay

Intent:

Make complex runs inspectable after the fact.

Changes:

- live event console
- structured run trace export
- provider latency and error dashboards
- per-tool success metrics
- run replay from event history
- bug report bundle export

Done when:

- a failed or surprising run can be reconstructed from the desktop product without log archaeology alone

### Task 8: Add dynamic tool construction

Intent:

Let operators bootstrap new tools from intent while keeping the resulting artifacts governable.

Changes:

- accept tool specifications through desktop flows
- generate tool skeletons only into real managed registries or workspaces
- require the generated tool to pass the same policy, audit, and capability labeling paths as existing tools

Done when:

- a generated tool is never a hidden exception to registry, approval, or observability rules

## Cleanup Expectations

The coordinator must schedule a heavy cleanup pass before P2 closure.

Cleanup includes:

- deleting any transitional policy or sandbox adapters that survived from earlier phases
- collapsing duplicated channel attachment logic
- removing background-service code paths that are no longer reachable
- normalizing audit and replay schema naming across runtime, storage, and desktop surfaces
- pruning temporary diagnostic scaffolding once stable surfaces exist

## Required P2 Verification

P2 must not close without these checks.

### Automated verification

- targeted tests for sandbox policy, allowlists, leak detection, approval routing, retrieval quality gates, replay integrity, and crash recovery behavior
- build and packaging verification for desktop background capabilities and update-channel paths

### Tauri MCP verification

Run the real app and verify all of the following through desktop interaction where applicable.

- configure and validate a sandbox or allowlist rule
- trigger a blocked outbound or sensitive action and verify the desktop approval path
- inspect memory graph and retrieval explainability after hybrid search is enabled
- attach and exercise at least one additional async channel beyond Slack and Discord
- run onboarding, diagnostics, and crash-recovery flows
- inspect live event console, trace export, and replay for a real run
- export a bug-report bundle and verify it contains the intended summaries without leaking secrets

### Cleanup and audit verification

- `git diff --check`
- datastore audit for secret handling, audit retention, and replay artifacts
- security review over outbound control, sandbox enforcement, and approval routing

## Exit Criteria

P2 is complete only when:

- desktop remains the sole control plane even with broader channels and background capabilities
- security and approval rules are enforceable, visible, and testable
- long-horizon memory and observability are genuinely usable from the product surface
- platform resilience features recover the operator from normal failure modes
- the full P2 Tauri MCP flow passes on a real app build
