# P0 Acceptance Checklist

Date: 2026-03-13

## Status

This document is a pre-acceptance checklist for P0.

- Acceptance has not been executed yet.
- No item in this checklist should be marked complete without fresh evidence from the current branch state.
- The final acceptance run must use a single running desktop app instance.

## Scope Guard

This checklist only covers P0 from:

- `docs/plans/2026-03-12-nuka-desktop-team-assistant/README.md`
- `docs/plans/2026-03-12-nuka-desktop-team-assistant/design.md`
- `docs/plans/2026-03-12-nuka-desktop-team-assistant/p0/implementation.md`

The acceptance run must reject any validation step that depends on P1 or P2 behavior.

## Acceptance Rules

- Use the real desktop app build.
- Use Tauri MCP for the page-driven flow.
- Do not replace UI validation with direct runtime-crate calls.
- Do not use mock providers, mock runtimes, fake run state, or fake file changes.
- Desktop must remain the only control plane during validation.
- `Chat` must remain the only execution surface during validation.
- `Team` may be used only for template management checks.
- `Agents` must remain the primary creation surface for agents.
- Run one desktop app instance only.
- Record evidence for every item before claiming P0 acceptance.

## Preflight

### Environment

- [ ] Confirm the branch under test is the intended P0 branch.
- [ ] Confirm the working tree is clean enough for acceptance and no unrelated local edits are being relied on.
- [ ] Confirm one real provider path is configured and reachable.
- [ ] Confirm the provider path is not a mock service.
- [ ] Confirm the workspace used for validation is disposable and can be audited afterward.

### UI Readiness Gate

- [ ] Complete the approved compact UI pass from `docs/plans/2026-03-14-p0-claude-compact-ui-design.md` before any final P0 acceptance run starts.
- [ ] Verify `Chat` no longer renders duplicated session-type copy or a header strip visually glued to the session rail.
- [ ] Verify the top tab rail supports overflow handling, compression, and close affordances without clipping or wrapping.
- [ ] Verify the chat composer is vertically aligned, visually unified, and free of `World` wording.
- [ ] Verify `Team run` reads as a compact conversation-first surface with secondary state cards instead of oversized equal-weight panels.
- [ ] Verify `Team`, `Agents`, `Memory`, and `Settings` share the same compact density and control styling baseline at default zoom.
- [ ] Do not start the required single-instance Tauri MCP acceptance flow until this gate passes.

### Automated Verification

- [ ] Run the targeted runtime and desktop tests that cover the touched P0 behaviors.
- [ ] Run the desktop build.
- [ ] Run the relevant Rust crate build or test commands for touched runtime and Tauri surfaces.
- [ ] Run formatting and lint checks for touched areas.
- [ ] Run `git diff --check`.

### Cleanup Gate

- [ ] Review touched files for dead workflow-only code, adapter residue, temporary types, and stale helper copy.
- [ ] Confirm no cleanup step removed a still-referenced production path.
- [ ] Confirm no P1 or P2 work was introduced while cleaning up P0.

## Task Coverage Checklist

### Task 1: Chat Entry Convergence

- [ ] `Chat` does not expose workflow creation or workflow routing language in the user flow.
- [ ] Direct chat, team creation, team follow-up, and branch continuation are the only active chat entry intents.
- [ ] No user-facing `workflow` route or `world` execution copy remains in the main chat path.

### Task 2: Non-Interactive Prompt Execution

- [ ] While the real desktop app is running, execute the desktop-owned prompt-to-result JSON path through the Tauri boundary.
- [ ] Verify the result is machine-readable JSON.
- [ ] Verify the JSON includes final output, `sessionId`, `runId`, provider metadata, routing metadata when present, and exit status.
- [ ] Verify the resulting session state is persisted in the desktop-owned store.
- [ ] Verify this path reuses the real runtime and does not bypass desktop ownership.

### Task 3: Session Auto-Compaction

- [ ] Drive a long-enough direct chat or team follow-up session to trigger compaction.
- [ ] Verify later turns continue successfully after compaction.
- [ ] Verify the compacted session still reads coherently in the active view.
- [ ] Verify compaction artifacts exist in storage and can be inspected for debugging.

### Task 4: Session Snapshots And Branching

- [ ] Create a branch from an existing direct chat anchor.
- [ ] Create a branch from an existing team run anchor.
- [ ] Verify the new branch appears as a normal top-tab session.
- [ ] Verify branch lineage and snapshot metadata remain attached after branch creation.
- [ ] Verify branch lineage survives app restart.

### Task 5: External Editor Prompt Drafting

- [ ] From `Chat`, open the external editor draft action.
- [ ] Draft or edit a long prompt externally.
- [ ] Return the edited content into the active composer.
- [ ] Send the returned prompt without leaving the desktop chat flow.
- [ ] Verify `Settings` controls the external editor path used by the action.

### Task 6: File-Change Timeline Visibility

- [ ] Run a team session that produces real file changes.
- [ ] Verify the active run view shows the file timeline inside `Chat`.
- [ ] Verify the timeline groups changes by round or checkpoint batch.
- [ ] Verify each batch shows which files changed and what kind of change occurred.
- [ ] Verify the timeline survives reload or restart of the app.

### Task 7: Session-Level Provider Selection And Failover

- [ ] In `Chat`, select the provider or model for the active session where allowed by the current UI.
- [ ] Verify the effective provider and model are shown in the active session surface.
- [ ] Trigger a real failover condition using configured provider routing.
- [ ] Verify the fallback provider and failover reason are rendered deterministically.
- [ ] Verify failover behavior remains desktop-governed through current settings and session metadata.

### Task 8: Run Queue, Recovery Panel, And Stuck-Run Hooks

- [ ] Start or queue enough work to render queued or active run-state lanes in `Chat`.
- [ ] Verify queued, blocked, stuck, and active states render inside `Chat` without switching to another execution page.
- [ ] Trigger a recoverable blocked state with a real failure mode.
- [ ] Verify retry and resume controls appear only when the run state allows them.
- [ ] Use retry or resume and confirm the run continues from the expected checkpoint path.
- [ ] Verify heartbeat timeout or stale-active detection can surface a stuck run as actionable state.

### Task 9: Open-Ended Agent Archetypes

- [ ] Open `Agents` and create or edit agents from broader archetype families, not only software roles.
- [ ] Verify archetype metadata supports reusable operating frames rather than a closed job enum.
- [ ] Verify at least one non-software archetype can be created and persisted through the current UI.
- [ ] Verify team assignment still works with the broader archetype model.

### Task 10: Settings Cleanup

- [ ] Open `Settings` at default zoom and verify the page fits without clipping critical controls.
- [ ] Verify the page reads as a compact operations surface rather than a documentation page.
- [ ] Verify provider routing, diagnostics, connection checks, close behavior, and external-editor controls remain available where in scope.
- [ ] Verify decorative helper copy removed during P0 did not leave empty or broken layout sections.

## Required Single-Instance Tauri MCP Flow

Run the steps below in order against one running desktop app instance.

### A. Boot And Connect

- [ ] Launch the real desktop app once.
- [ ] Attach Tauri MCP to that instance only.
- [ ] Confirm the app opens to the current desktop shell and real persisted workspace state.

### B. Direct Chat Start

- [ ] Open `Chat`.
- [ ] Start a direct session.
- [ ] Verify the composer, session state, and resulting messages use chat-first terminology only.

### C. Team Run Start

- [ ] From `Chat`, create a team-backed session using an existing team template.
- [ ] Start the run.
- [ ] Verify the top tabs reflect the new run and active branch context.

### D. Branch Continuation

- [ ] Branch from an existing direct chat anchor and continue the branch.
- [ ] Branch from an existing team run anchor and continue the branch.
- [ ] Verify both branches behave like normal top-level chat sessions after creation.

### E. Queue And Recovery

- [ ] Exercise the run queue so queued state is visible.
- [ ] Exercise a blocked or stuck state so recovery controls are visible.
- [ ] Use retry or resume from the run view and verify the state updates in place.

### F. File Timeline

- [ ] Open the active run view.
- [ ] Inspect the file timeline in `Chat`.
- [ ] Verify timeline entries correspond to the actual file operations performed by the run.

### G. External Editor

- [ ] Use the external editor flow from `Chat`.
- [ ] Return edited content to the composer.
- [ ] Dispatch the resulting prompt successfully.

### H. Provider Visibility

- [ ] Verify the active session shows effective provider and model state.
- [ ] If failover was triggered, verify the fallback path and reason are visible in the same execution surface.

### I. Restart Recovery

- [ ] Close the app.
- [ ] Re-open the same app instance path.
- [ ] Reconnect Tauri MCP.
- [ ] Verify branch lineage persists.
- [ ] Verify run recovery state persists.
- [ ] Verify file timeline visibility persists for the validated run.

## Data And Secret Audit

Run these checks after the UI flow if any provider or secret-adjacent path was touched during P0.

- [ ] Audit SQLite and any local plaintext stores for forbidden provider secrets.
- [ ] Verify no real secret is rendered in UI, logs, command output, or recorded evidence.
- [ ] Verify provider routing metadata is stored without leaking secret values.
- [ ] Verify legacy workflow-only settings residue is absent from active storage schema and persisted records.

## Evidence To Capture

- [ ] Commands used for automated verification.
- [ ] Tauri MCP interaction notes for each required UI step.
- [ ] Screenshots or snapshots for the active chat run, queue rail, recovery panel, file timeline, branch tabs, and settings page.
- [ ] Persistence evidence after restart.
- [ ] Audit notes for secrets and cleanup.
- [ ] Final pass-fail decision for each task from Task 1 through Task 10.

## Sign-Off Template

Use this block only after the full acceptance run is executed.

```md
Acceptance date:
Branch:
Desktop build:
Provider path:

Automated verification:
- pass/fail:
- notes:

Tauri MCP flow:
- pass/fail:
- notes:

Restart recovery:
- pass/fail:
- notes:

SQLite/plaintext audit:
- pass/fail:
- notes:

Cleanup review:
- pass/fail:
- notes:

Final P0 decision:
- accepted / rejected
- blocking gaps:
```
