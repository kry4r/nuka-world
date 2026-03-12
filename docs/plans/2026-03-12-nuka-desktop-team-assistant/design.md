# Nuka Desktop Team Assistant Design

Date: 2026-03-12

## Product Definition

`Nuka` is `your desktop team assistant`.

It is not a coding-only product. It is a desktop-first agent operating environment that lets a user create, govern, and follow teams of agents covering work and life responsibilities from one authoritative control plane.

A team may include software agents, but it may also include agents for research, planning, operations, finance, recruiting, household coordination, travel, trading, procurement, wellness, support, or any other domain the user can express through current runtime primitives.

## Fixed Decisions

- Desktop is the only control plane.
- `Chat` is the only primary session and execution surface.
- `Team` manages existing team templates and never becomes a second execution surface.
- `Agents` is the primary creation and editing surface for agent resources.
- Slack and Discord are continuation channels attached to desktop-owned sessions.
- Foundational resources are created and governed on desktop only.
- No mock implementations are allowed anywhere.
- Backend changes should optimize runtime efficiency and token spend, not preserve unnecessary compatibility paths.
- Large refactors are allowed when they remove dead paths and improve runtime quality.
- Frontend evolution should preserve a concise, visually disciplined interface with minimal helper copy.
- Every design choice must map back to current code and current desktop pages before implementation starts.

## Non-Goals

- creating a browser-first product
- making Slack or Discord equivalent to desktop governance
- preserving workflow-era route abstractions for compatibility alone
- adding speculative surfaces that have no current code anchor
- using placeholder runtimes, fake providers, or synthetic demo paths to simulate readiness

## Current-State Diagnosis

The current app has already moved toward a real team runtime, but it still contains structural signals from the older workflow model.

### Session model residue

`apps/desktop/src-tauri/src/commands/chat.rs` still exposes workflow-shaped route types such as `CreateWorkflow`, `SpecificWorkflow`, `ExistingWorkflow`, and `NewWorkflow`. That naming keeps old mental models alive inside the main chat entry point even after the hard-cut direction was approved.

### Runtime split

The current runtime still spans the newer team services and the older world/workflow services.

Relevant files:

- `crates/nuka-runtime/src/chat_service.rs`
- `crates/nuka-runtime/src/team_service.rs`
- `crates/nuka-runtime/src/team_run_service.rs`
- `crates/nuka-runtime/src/workspace_sessions.rs`
- `crates/nuka-runtime/src/world.rs`
- `crates/nuka-runtime/src/workflow.rs`

This means the product direction is ahead of the runtime naming and dependency graph.

### Desktop surface strengths

The current desktop already has the right page scaffolding.

- `ChatPage.tsx` is already the correct home for session tabs, direct chat, and team run follow-up.
- `TeamPage.tsx` is already close to an edit-only template surface.
- `SettingsPage.tsx` already exists as the correct home for provider, diagnostics, and behavior controls.
- `MemoryPage.tsx` and `KnowledgePage.tsx` already provide anchors for long-lived context and retrieval features.

### Desktop surface gaps

The pages remain too tightly coupled to the current hard-cut slice.

- `Chat` still needs explicit run control, branching, archive access, and run queue visibility.
- `Team` still needs version awareness and stronger pre-run review surfaces.
- `Agents` still needs a broader archetype model than software roles alone.
- `Settings` still needs to converge on concise operational controls instead of descriptive filler.

## Design Principles

### 1. Desktop-first authority

All durable configuration, approval, policy, provider routing, agent definition, team definition, and channel attachment setup must originate on desktop.

A Slack or Discord message may continue a run, but it cannot redefine the system of record.

### 2. Runtime truth over compatibility

If a legacy runtime path or route name no longer matches the product, it should be removed instead of translated forward through thin adapters.

### 3. Open archetypes, not a closed taxonomy

An agent archetype in Nuka is a reusable operating frame, not a hardcoded profession enum.

The model should support fields such as:

- domain focus
- objective pattern
- communication style
- default tool posture
- memory posture
- escalation posture
- safety posture
- output contract

This allows the same runtime to express a software reviewer, household planner, trader, research assistant, travel planner, or operations coordinator without changing the product model.

### 4. Minimal desktop copy

The desktop UI should not explain itself through paragraphs of helper text. It should make the right controls visible in the place where the action happens.

### 5. Real verification only

The product is only considered real when it can be exercised through the running desktop app, via Tauri MCP, against real persistence and real provider integrations.

## Core Product Model

### Workspace

A workspace owns durable product state.

It contains:

- providers and provider routing metadata
- agent archetypes and concrete agents
- team templates and team versions
- sessions and runs
- memory, knowledge, and audit artifacts
- channel attachments
- settings and approval policy

### Agent Archetype

An archetype is a reusable operating template from which one or more concrete agents can be derived.

It should not be limited to software delivery roles.

Examples of valid archetype families include:

- engineering and testing
- product and operations
- finance and trading
- legal and compliance
- research and analysis
- education and coaching
- household and personal logistics
- travel and event planning
- support and communications
- procurement and vendor management

### Agent

An agent is a concrete, executable resource derived from an archetype or manually composed on the `Agents` page.

It should continue to live as a first-class resource that can be assigned into teams, runs, and future channel attachments.

### Team Template

A team template is a durable blueprint that references existing agents and constrains how they operate together.

A template contains at minimum:

- mission
- success criteria
- prompt constraints
- permission policy
- agent assignments
- future version lineage

### Run

A run is the executable realization of either direct chat work or team work.

Every run should expose:

- status and recovery state
- current round and checkpoint state
- provider and model routing state
- file change timeline
- event feed
- cost and duration metrics
- memory write audit trail

### Channel Attachment

A channel attachment binds an external channel to an existing desktop-owned session or run.

The channel attachment does not become a new session authority. It mirrors and continues an existing session with explicit desktop governance.

## Information Architecture Anchored To Existing Pages

### Chat

`apps/desktop/src/features/chat/ChatPage.tsx` remains the main execution surface.

It should absorb the following responsibilities over time:

- direct prompt entry and result rendering
- run queue visibility
- session archive access
- run tabs and branch tabs
- branch creation from historical turns
- recovery controls such as retry and resume
- external channel follow-up visibility
- file change timeline for the active run
- per-session provider and model view

### Team

`apps/desktop/src/features/team/TeamPage.tsx` remains an edit-first template surface.

It should absorb:

- template version history
- assignment diffs relative to the last version
- charter and playbook selection
- run preflight review before launch

It should not absorb ongoing execution responsibility.

### Agents

`apps/desktop/src/features/agents/AgentsPage.tsx` remains the primary creation surface.

It should evolve to support:

- archetype-first creation
- broader domain-oriented presets
- provider and permission overrides when the roadmap phase allows them
- clearer budget and tool posture controls

### Memory

`apps/desktop/src/features/memory/MemoryPage.tsx` remains the durable memory governance surface.

It should evolve toward:

- explainable hits
- retention policy views
- graph relations by type and activity
- approval and rejection actions for memory retention decisions

### Knowledge

`apps/desktop/src/features/knowledge/KnowledgePage.tsx` remains the durable externalized context surface.

It should evolve toward workspace knowledge packs, source status, and retrieval observability.

### Settings

`apps/desktop/src/features/settings/SettingsPage.tsx` remains the compact operations console.

It should converge on:

- provider routing
- connection checks
- close behavior
- channel attachment governance
- diagnostics and doctor actions
- update channels and background-service settings in later phases

## Runtime Direction

### Remove workflow-shaped residue

The current `world.rs`, `workflow.rs`, and workflow-shaped chat commands should be converged into the desktop session model or removed.

The desired runtime shape is:

- one desktop-owned workspace session projection
- one run model that supports direct and team execution paths cleanly
- explicit checkpoint and recovery semantics
- explicit provider routing and failover semantics
- explicit memory and file-change event streams

### Optimize token and runtime efficiency

Backend implementation choices should prefer:

- summarizing forward instead of replaying unbounded message history
- run-local snapshots instead of repeated reconstruction work
- deterministic provider routing and failover rules
- explicit tool budgets and permission budgets where phase scope allows
- event streams that can be resumed without replaying the entire run

### Full refactors are acceptable

If the shortest path to a clean model is a substantial refactor across runtime services, storage, and desktop commands, that refactor is preferred over leaving a partially migrated architecture in place.

## Channel Strategy

Slack and Discord are valid continuation channels in later phases, but they must obey the desktop-first model.

This means:

- channel attachments are created and governed on desktop
- session ownership remains in desktop persistence
- policy, provider routing, and permission budgets remain desktop-controlled
- channel messages attach to existing session or run IDs
- channel-local shortcuts never bypass desktop-defined safety and governance rules

## Security And Governance Rules

- no plaintext provider secrets in SQLite
- no real secrets echoed back through UI, command results, logs, or audit summaries
- no mock provider implementations to stand in for verification
- no fake tool results to simulate run state
- no skipped cleanup after refactors
- all sensitive actions should move toward explicit governance and audit visibility as phases advance

## Frontend Implementation Rules

Frontend work for these phases must use the relevant UI skills and preserve a deliberate desktop design language.

Required rules:

- keep layout compact and visually balanced
- remove unnecessary helper copy
- let controls live next to the data they affect
- avoid generic dashboard clutter
- preserve clear hierarchy between navigation, content, and run-state surfaces
- ensure default desktop zoom shows the whole working surface without clipping critical controls

## Verification Rules

A phase cannot advance until verification proves the product state through real desktop interaction.

Required verification behavior:

- start the real Tauri desktop app
- drive it through Tauri MCP rather than backend-only shortcuts
- execute the documented flow for that phase end to end
- confirm persistence and recovery behavior through app restart when relevant
- perform data-store audits for secret handling and other explicit safety claims
- perform a cleanup pass and document what was removed

## Documentation And Execution Contract

This design is implemented through the phase documents in:

- `docs/plans/2026-03-12-nuka-desktop-team-assistant/p0/implementation.md`
- `docs/plans/2026-03-12-nuka-desktop-team-assistant/p1/implementation.md`
- `docs/plans/2026-03-12-nuka-desktop-team-assistant/p2/implementation.md`

Each phase document must keep tasks tied to current files, current commands, and current desktop pages. If a proposed task cannot point to an existing code anchor, it does not belong in the active phase.
