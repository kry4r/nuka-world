# P0 Implementation

Date: 2026-03-12

## Phase Goal

Turn the current desktop app into a clean desktop-first control plane for `Nuka`, remove the remaining workflow-era runtime residue, and add the core session and run capabilities needed for long-lived real usage.

P0 is the phase where the product stops feeling like a hard-cut migration and starts feeling like a durable desktop operator console.

## Mandatory Execution Rules

- Every implementation task must start from current code and name the files it changes.
- Every task follows red-green-refactor discipline.
- No mock runtime, mock provider, or fake UI flow is allowed.
- Compatibility residue should be removed, not hidden behind adapters.
- Frontend work must apply the relevant UI skills and keep copy minimal.
- Before phase closure, Codex must perform a cleanup pass on all touched areas.
- Before phase closure, Tauri MCP must execute the full documented P0 flow on a real app build.

## Current Code Anchors For P0

### Desktop

- `apps/desktop/src/features/chat/ChatPage.tsx`
- `apps/desktop/src/features/chat/SessionTabs.tsx`
- `apps/desktop/src/features/chat/TeamRunPanel.tsx`
- `apps/desktop/src/features/team/TeamPage.tsx`
- `apps/desktop/src/features/agents/AgentsPage.tsx`
- `apps/desktop/src/features/settings/SettingsPage.tsx`
- `apps/desktop/src/hooks/useWorkspaceSessions.ts`
- `apps/desktop/src/lib/chat.ts`
- `apps/desktop/src/lib/team.ts`
- `apps/desktop/src/lib/workspace.ts`

### Tauri and runtime

- `apps/desktop/src-tauri/src/commands/chat.rs`
- `apps/desktop/src-tauri/src/commands/team.rs`
- `apps/desktop/src-tauri/src/commands/workspace.rs`
- `apps/desktop/src-tauri/src/commands/settings.rs`
- `crates/nuka-runtime/src/chat_service.rs`
- `crates/nuka-runtime/src/team_service.rs`
- `crates/nuka-runtime/src/team_run_service.rs`
- `crates/nuka-runtime/src/workspace_sessions.rs`
- `crates/nuka-runtime/src/world.rs`
- `crates/nuka-runtime/src/workflow.rs`
- `crates/nuka-storage/src/chat.rs`
- `crates/nuka-storage/src/team_runs.rs`
- `crates/nuka-storage/src/settings.rs`

## Scope

P0 covers the following product outcomes.

- open-ended agent archetypes
- non-interactive prompt-to-result execution with JSON output
- session auto-compaction
- session snapshots and branching
- external-editor prompt drafting
- file change timeline per run
- session-level model selection and provider failover foundations
- run queue and basic recovery panel
- multi-run isolation hardening
- stuck-run detection and self-recovery hooks
- final removal of workflow route residue from main chat execution
- cleaner `Settings` surface with operationally meaningful controls only

## Parallel Delivery Layout

P0 should be executed by non-overlapping tracks.

### Coordinator

Owns sequence control, shared contracts, cleanup review, and final verification.

Shared responsibilities:

- freeze task boundaries before coding
- prevent overlapping edits
- merge completed tracks only after independent verification
- own final Tauri MCP phase validation and SQLite audits

### Track A: Runtime model and storage cleanup

Primary goal is to converge the runtime onto a single desktop-owned session and run model.

Primary files:

- `apps/desktop/src-tauri/src/commands/chat.rs`
- `apps/desktop/src-tauri/src/commands/workspace.rs`
- `crates/nuka-runtime/src/chat_service.rs`
- `crates/nuka-runtime/src/team_run_service.rs`
- `crates/nuka-runtime/src/workspace_sessions.rs`
- `crates/nuka-runtime/src/world.rs`
- `crates/nuka-runtime/src/workflow.rs`
- `crates/nuka-storage/src/chat.rs`
- `crates/nuka-storage/src/team_runs.rs`

### Track B: Desktop session UX and settings cleanup

Primary goal is to expose the new runtime cleanly in the current desktop pages without adding explanatory clutter.

Before the coordinator starts final P0 verification, Track B must also pass a compact UI readiness gate:

- `Chat` header metadata cannot collide with or duplicate the tab rail
- session tabs must handle overflow cleanly and expose close affordances
- the composer must align as one compact control surface with no `World` residue
- `Team run` must read as a compact conversation-first surface rather than oversized dashboard cards
- `Team`, `Agents`, `Memory`, and `Settings` must share the same density and control baseline at default zoom

Primary files:

- `apps/desktop/src/features/chat/ChatPage.tsx`
- `apps/desktop/src/features/chat/SessionTabs.tsx`
- `apps/desktop/src/features/chat/TeamRunPanel.tsx`
- `apps/desktop/src/features/team/TeamPage.tsx`
- `apps/desktop/src/features/settings/SettingsPage.tsx`
- `apps/desktop/src/hooks/useWorkspaceSessions.ts`
- `apps/desktop/src/lib/chat.ts`
- `apps/desktop/src/lib/team.ts`
- `apps/desktop/src/lib/workspace.ts`

### Track C: Agent archetype expansion and run observability

Primary goal is to broaden the agent model and expose run visibility features that depend on current agent and memory surfaces.

Primary files:

- `apps/desktop/src/features/agents/AgentsPage.tsx`
- `apps/desktop/src/features/agents/**`
- `apps/desktop/src/features/memory/**`
- `crates/nuka-domain/src/agent.rs`
- `crates/nuka-storage/src/agents.rs`
- `crates/nuka-runtime/src/memory_service.rs`

No track should edit another track's active files until the coordinator merges a verified checkpoint.

## Task Breakdown

### Task 1: Remove workflow-shaped routing from chat entry

Intent:

Collapse the remaining `workflow` naming and route branching out of the main chat entry surface.

Changes:

- replace `ChatModeInput` workflow variants in `apps/desktop/src-tauri/src/commands/chat.rs` with direct desktop session intent types
- remove or converge `WorldRoute` and `WorldChatMode` usage in `crates/nuka-runtime/src/world.rs`
- migrate callers in `apps/desktop/src/lib/chat.ts` and `apps/desktop/src/features/chat/ChatPage.tsx`
- delete unreachable workflow-only command paths and tests

Done when:

- no user-facing desktop flow references workflow creation or workflow routing
- `Chat` only dispatches direct chat, team creation, team follow-up, or branch continuation intents

### Task 2: Add non-interactive prompt execution with JSON output

Intent:

Support desktop-owned scriptable execution for `prompt -> result` without inventing a second product surface.

Changes:

- add a CLI or command-oriented entry through current Tauri or runtime boundaries
- emit machine-readable JSON for final result, session id, run id, provider metadata, and exit status
- reuse existing runtime paths rather than duplicating agent logic

Primary files:

- `apps/desktop/src-tauri/src/commands/chat.rs`
- `crates/nuka-runtime/src/chat_service.rs`
- `crates/nuka-runtime/src/team_run_service.rs`

Done when:

- a scripted call can create a desktop-owned session or run and return structured JSON without screen scraping
- desktop persistence still owns the resulting session state

### Task 3: Add session auto-compaction

Intent:

Prevent long sessions from exhausting context windows and degrading token efficiency.

Changes:

- add compaction thresholds to current session persistence and runtime reads
- summarize older turns into durable compact context records
- continue new turns on top of summarized history

Primary files:

- `crates/nuka-runtime/src/chat_service.rs`
- `crates/nuka-runtime/src/team_run_service.rs`
- `crates/nuka-storage/src/chat.rs`
- `crates/nuka-storage/src/team_runs.rs`

Done when:

- long sessions can continue after compaction without losing active continuity
- compaction artifacts are visible enough for debugging and recovery

### Task 4: Add session snapshots and branching

Intent:

Let users fork from any meaningful point in a chat or run.

Changes:

- introduce snapshot records attached to existing chat and run history
- add branch creation and branch activation through current workspace session plumbing
- expose branch tabs in `Chat`

Primary files:

- `crates/nuka-runtime/src/workspace_sessions.rs`
- `crates/nuka-storage/src/chat.rs`
- `crates/nuka-storage/src/team_runs.rs`
- `apps/desktop/src/features/chat/SessionTabs.tsx`
- `apps/desktop/src/hooks/useWorkspaceSessions.ts`

Done when:

- a user can branch from existing history and continue the branch as a normal top-tab session
- branch lineage survives restart

### Task 5: Add external-editor prompt drafting

Intent:

Support long-form prompt drafting without bloating the chat composer itself.

Changes:

- add a desktop action to open draft text in the configured external editor path
- return edited content to the current composer when saved and accepted
- keep the default `Chat` surface visually compact

Primary files:

- `apps/desktop/src/features/chat/ChatPage.tsx`
- `apps/desktop/src/features/settings/SettingsPage.tsx`
- `apps/desktop/src-tauri/src/commands/settings.rs`

Done when:

- a user can draft a long prompt externally and send it back into the current session without leaving the desktop workflow model

### Task 6: Add file-change timeline visibility

Intent:

Make run impact inspectable without requiring terminal diff reconstruction.

Changes:

- capture file-touch events from the current run execution path
- group file changes by round or turn
- render the active run timeline in `Chat`

Primary files:

- `crates/nuka-runtime/src/team_run_service.rs`
- `crates/nuka-runtime/src/chat_service.rs`
- `apps/desktop/src/features/chat/TeamRunPanel.tsx`
- `apps/desktop/src/features/chat/ChatPage.tsx`

Done when:

- the active run view shows which files changed, when they changed, and what round produced them

### Task 7: Add session-level provider selection and failover foundations

Intent:

Allow routing control closer to the active run while preserving desktop-owned provider governance.

Changes:

- extend session and run metadata to include requested provider and model overrides
- resolve fallback chains through the current provider service instead of ad hoc retry logic
- expose the effective routing state in `Chat` and `Settings`

Primary files:

- `crates/nuka-runtime/src/chat_service.rs`
- `crates/nuka-runtime/src/team_run_service.rs`
- `apps/desktop/src/features/chat/ChatPage.tsx`
- `apps/desktop/src/features/settings/SettingsPage.tsx`

Done when:

- the active session shows which provider and model are in effect
- failover behavior is deterministic and testable

### Task 8: Add run queue, recovery panel, and stuck-run hooks

Intent:

Make the current runtime operable under interruption rather than opaque.

Changes:

- expose queued, running, blocked, and completed run states through workspace session projections
- add retry and resume controls backed by explicit checkpoint semantics
- add timeout and heartbeat tracking for stuck-run detection

Primary files:

- `crates/nuka-runtime/src/workspace_sessions.rs`
- `crates/nuka-runtime/src/team_run_service.rs`
- `apps/desktop/src/features/chat/ChatPage.tsx`
- `apps/desktop/src/lib/workspace.ts`

Done when:

- `Chat` can show run state and recovery actions without opening another page
- a stuck run surfaces as an actionable state, not silent failure

### Task 9: Expand agent archetypes beyond software roles

Intent:

Remove the product implication that agents are mainly programmers with renamed titles.

Changes:

- add archetype metadata to current agent records
- introduce broader built-in archetype families derived from current agent creation flows
- keep the model open-ended so users can create new archetypes without code changes

Primary files:

- `crates/nuka-domain/src/agent.rs`
- `crates/nuka-storage/src/agents.rs`
- `apps/desktop/src/features/agents/AgentsPage.tsx`
- `apps/desktop/src/features/agents/**`

Done when:

- agent creation can represent non-software roles cleanly
- archetypes are treated as reusable operating frames, not fixed job enums

### Task 10: Clean up Settings into a compact operations surface

Intent:

Make `Settings` operational and quiet.

Changes:

- remove decorative helper copy that does not alter decision quality
- keep only the settings that drive live behavior in P0 scope
- surface diagnostics, provider routing, connection checks, and close behavior with concise labels

Primary files:

- `apps/desktop/src/features/settings/SettingsPage.tsx`
- `apps/desktop/src/features/settings/**`

Done when:

- default zoom shows the full working area without clipping important controls
- the page reads like an operations panel, not documentation

## Cleanup Expectations

The coordinator must schedule an explicit cleanup pass after the last feature task and before final verification.

Cleanup includes:

- deleting dead workflow code
- removing obsolete tests and fixtures
- pruning temporary adapter types
- normalizing session and run naming across the desktop and runtime layers
- removing helper copy added during implementation that no longer earns its place

## Required P0 Verification

P0 must not close without these checks.

### Automated verification

- targeted unit and integration tests for every new runtime behavior
- regression coverage for session compaction, branching, failover selection, and recovery state
- build verification for desktop and runtime crates
- lint and formatting checks for touched areas

### Tauri MCP verification

Run the real app and verify all of the following through UI interaction where applicable.

Do not start this verification block until the compact UI readiness gate above passes.

- open `Chat` and start a direct session
- create a team from `Chat`
- start the team run and verify the top tabs reflect the new run
- branch from an existing session or run point and continue on the branch
- exercise the run queue and confirm queued and active states render correctly
- trigger or simulate a recoverable blocked state and verify retry or resume controls
- inspect file-change timeline output inside the run view
- open the external editor flow and return a long prompt into the composer
- verify the effective provider and model shown for the active session
- restart the app and confirm branch and run recovery state persists

### Cleanup and audit verification

- `git diff --check`
- database audit for forbidden plaintext secrets if any provider work was touched during the phase
- code cleanup review over touched files before merge

## Exit Criteria

P0 is complete only when:

- `Chat` behaves as the single authoritative execution surface
- remaining workflow residue no longer shapes session creation or routing
- the desktop can sustain longer sessions through compaction and branching
- run state becomes visible and recoverable from the current `Chat` page
- agents can represent broader real-world roles cleanly
- the desktop remains visually concise at default zoom
- the compact UI readiness gate has passed before Tauri MCP acceptance begins
- the full P0 Tauri MCP flow passes on a real app build
