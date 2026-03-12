# Team Runtime Provider Hard Cut Design

Date: 2026-03-12

## Goal

Hard-cut the desktop app onto the real team runtime path, remove workflow user flows and most compatibility tests, move provider secrets into the system keyring, and prove the resulting product through real Tauri MCP page-driven smoke tests.

The product target for this iteration is:

- `Chat` is the only session entry and execution surface
- `Team` is only a persistent team-template management surface
- `Agents` is the only primary agent creation surface
- top-level chat tabs switch between real `direct_chat` and `team_run` sessions
- provider metadata persists in SQLite while secrets persist in the OS keyring
- `Settings` contains a small set of settings that are actually live and testable
- the app can be verified end-to-end through real UI interaction against a real OpenAI-compatible provider

## Fixed Decisions

The following decisions are fixed for this design:

- The workflow user flow is removed rather than preserved as a compatibility path.
- Tauri command registration for workflow operations is removed.
- Most workflow compatibility tests are removed.
- `Chat` owns team creation, run launch visibility, and ongoing run interaction.
- `Team` owns only existing team-template management.
- `Agents` owns agent creation and base agent editing.
- A `Team` is a persistent template, not a running session.
- A `TeamRun` is the only executable session form for team collaboration.
- Provider secrets use the system keyring, not SQLite.
- SQLite stores provider metadata, keyring references, and secret presence metadata only.
- `Settings` must prove real behavior for `default provider`, `connection checks`, and `close behavior`.
- Real smoke coverage must use Tauri MCP and front-end page interaction, not direct backend-only invocation.

## Current State And Problems

The current app is split between a real provider-backed chat path and a partially legacy workflow path.

Important current code paths:

- Tauri still registers workflow commands in `apps/desktop/src-tauri/src/lib.rs`.
- Workflow-specific backend commands still live in `apps/desktop/src-tauri/src/commands/workflow.rs`.
- Provider CRUD currently stores and returns plaintext API keys through `apps/desktop/src-tauri/src/commands/providers.rs`.
- Provider persistence currently writes plaintext tokens into SQLite through `crates/nuka-storage/src/providers.rs`.
- `Settings` currently saves many values, but only a small subset meaningfully affects runtime behavior.
- `TeamPage` currently launches a run but does not yet fully behave as a template-only management page with Chat as the single execution home.

This creates four mismatches:

1. The product already wants team runtime, but code still exposes workflow commands and tests.
2. Provider secrets are still persisted and echoed as plaintext.
3. Settings offers many controls that are not clearly live.
4. The real smoke path the user wants does not yet map cleanly to the current UI responsibilities.

## Product Model

This iteration centers the app on four persistent objects and one projection.

### Agent

`Agent` is an independently managed resource.

It is created and edited from the `Agents` page and includes at least:

- `id`
- `name`
- `role`
- `responsibility`
- `systemPrompt`
- `toolBindings`
- `toolUsePolicy`
- `createdAt`
- `updatedAt`
- `status`

An agent is not created from inside `Team`. Team only references or constrains agents that already exist.

### Team

`Team` is a persistent template, not a session.

It includes at least:

- `id`
- `name`
- `goal`
- `summary`
- `promptConstraints`
- `permissionPolicy`
- `createdAt`
- `updatedAt`
- `status`
- `agentAssignments`

`agentAssignments` defines:

- which existing agents belong to the team
- ordering or role emphasis inside the team
- whether an assigned agent is enabled in the template
- any team-level prompt or permission tightening applied to that agent

### Team Run

`TeamRun` is the executable session created from a team template.

It includes at least:

- `id`
- `teamId`
- `title`
- `goal`
- `status`
- `currentPhase`
- `leadAgentId`
- `charter`
- `createdAt`
- `updatedAt`

### Team Run Agent

When a run starts, the runtime freezes assigned agents into run-local copies.

Each run-local agent includes at least:

- `id`
- `runId`
- `sourceAgentId`
- `sourceTeamAssignmentId`
- `name`
- `role`
- `responsibility`
- `systemPrompt`
- `toolBindings`
- `toolUsePolicy`
- `status`
- `currentWork`
- `lastToolActivity`
- `joinedAt`

This snapshot model is required so that:

- team template edits do not mutate historical runs
- agent definition edits do not mutate historical runs
- runtime state remains readable after template changes

### Workspace Session

`Chat` treats the top tab strip as a session switcher over real persisted sessions.

A workspace session is only:

- `direct_chat`
- `team_run`

Each session summary includes at least:

- `id`
- `kind`
- `title`
- `status`
- `updatedAt`

The workspace-session list is a backend projection over durable stores and must survive app restart.

## Information Architecture

### Chat

`Chat` is the only session entry and execution page.

Its responsibilities are:

- host all active workspace sessions in top tabs
- create teams from natural-language intent through `create_team_from_goal`
- render direct chat sessions
- render active team runs
- allow follow-up instructions on active team runs
- show team-run status, lead agent, and event activity
- make newly started team runs immediately visible through the tab strip

When the active tab is a normal chat, the page behaves like a normal conversation surface.

When the active tab is a team run, the page renders:

- a session tab strip
- a team-run agent strip
- a structured run event feed
- a composer for follow-up instructions

### Team

`Team` is a team-template management page only.

Its responsibilities are:

- list existing teams
- load a selected team template
- edit team description fields
- edit team prompt constraints
- edit team permission constraints
- add or remove agents from the template
- launch a run from an existing template

It does not create teams. Team creation starts from `Chat`.

It does not create agents. Agent creation starts from `Agents`.

It does not host run execution. All run execution remains in `Chat`.

### Agents

`Agents` is the primary agent resource page.

Its responsibilities are:

- create new agents
- edit existing agents
- manage agent-level prompts and tool policies
- expose agents as selectable resources for team assignment

### Settings

`Settings` remains the provider and runtime behavior surface.

It must support:

- provider CRUD
- default provider selection
- connection-check policy
- close behavior
- clear provider secret state
- explicit env import only if secrets are still routed into the keyring rather than SQLite

## Provider Secret Storage

Provider persistence changes from plaintext SQLite storage to `SQLite metadata + OS keyring secret`.

### Storage Rules

SQLite stores:

- provider `id`
- provider `name`
- provider `base_url`
- provider `model`
- provider `enabled`
- `secret_ref`
- `secret_present`
- `secret_updated_at`

SQLite does not store:

- plaintext API keys
- reversible encrypted blobs for this iteration

The system keyring stores the actual provider secret.

On Windows, this means Credential Manager through a backend `ProviderSecretStore` implementation.

Recommended stable key naming:

- service: `nuka-world.desktop.providers`
- account: `provider:{provider_id}`

### Save Semantics

`save_provider` accepts metadata plus an optional `apiKey` write-only field.

Behavior:

- if `apiKey` is non-empty, write it into the system keyring and update keyring metadata in SQLite
- if `apiKey` is empty during a normal metadata edit, keep the existing secret unchanged
- if the user explicitly clears the secret, remove it from the keyring and clear `secret_present`

### Read Semantics

`list_providers` and other UI-facing responses do not return the secret value.

Instead they return metadata like:

- `hasSecret`
- `secretUpdatedAt`

Settings shows:

- empty password field by default
- `Secret saved` or `No secret saved`
- explicit `Replace secret`
- explicit `Clear secret`

### Delete Semantics

Deleting a provider must delete both:

- provider metadata in SQLite
- provider secret in the system keyring

### Migration

Existing plaintext tokens in SQLite must be migrated:

1. read current token values
2. write each into the system keyring
3. persist reference metadata
4. clear the plaintext token column

After migration, runtime reads must stop depending on the plaintext token column.

## Settings That Must Actually Work

This iteration does not promise every currently visible setting is live.

It does promise that the following settings are real, observable, and smoke-testable.

### Default Provider

`default_provider_id` must directly drive:

- provider readiness indicators
- `create_team_from_goal`
- `start_team_run`
- `continue_team_run`

Observable behavior:

- sidebar or settings readiness label updates immediately
- run or event payloads identify the provider used for execution

### Connection Checks

`connection_checks` must control whether the app performs a lightweight provider preflight before provider-dependent actions.

Observable behavior when enabled:

- UI emits visible preflight status such as `provider_check_started` and `provider_check_passed`

Observable behavior when disabled:

- the preflight path is skipped
- provider-dependent actions proceed directly to the real request path

### Close Behavior

`close_behavior` must continue to drive the tray close policy.

Observable behavior:

- `Minimize to tray` hides the window and keeps the app running
- `Quit app` exits instead of hiding

## Team And Agent Permission Model

Permissions are constrained in three layers.

### Agent-Level Permissions

Each agent definition stores its own tool bindings and tool-use policy.

### Team-Level Constraints

Each team template may tighten agent behavior through:

- team prompt constraints
- team permission policy
- per-assignment enablement
- per-assignment override values that only reduce permissions

Teams do not expand an agent's permissions beyond the base agent definition.

### Run-Level Snapshot

When a team run starts, the resolved effective permissions are frozen into run-local agents.

The runtime does not silently expand permissions during execution.

## Team Creation And Execution Flow

### Create Team

The primary team-creation flow is:

1. user opens `Chat`
2. user chooses or triggers `Create team`
3. frontend calls `create_team_from_goal(goal)`
4. backend uses the active default provider to generate the team template
5. backend persists the team template immediately
6. frontend makes the new team available in the team-management surfaces

If provider readiness is missing or degraded:

- creation fails honestly
- UI directs the user to `Settings`

### Edit Team

The team-management flow is:

1. user opens `Team`
2. user selects an existing team
3. user edits description, prompt constraints, permission policy, and assigned agents
4. user saves the team template

### Start Run

The run-launch flow is:

1. user starts a run from an existing team template
2. backend snapshots the resolved team configuration into run-local tables
3. backend creates initial run charter and events
4. the workspace-session projection exposes the new `team_run`
5. `Chat` shows the run as a real top-tab session

### Continue Run

All run interaction stays in `Chat`.

The user:

- switches to the team-run tab in Chat
- observes team activity
- sends follow-up instructions

The Team page does not become a run room.

## Workflow Hard Cut

This iteration removes workflow as a user-facing path.

Required changes:

- remove workflow command registration from `apps/desktop/src-tauri/src/lib.rs`
- remove workflow-driven front-end user flow dependencies
- remove most workflow compatibility tests
- keep only lower-level model pieces that are still genuinely reused elsewhere

Workspace sessions must only describe:

- `direct_chat`
- `team_run`

The frontend must stop relying on workflow-oriented language or workflow-room assumptions.

## Tauri MCP Real Smoke Scope

Real verification must drive the running desktop app through front-end page interaction.

Use the provided real provider configuration:

- `base URL`: `https://api.daiju.live/v1`
- `model`: `MiniMax-M2.5`

The smoke flow must cover:

1. open `Settings`
2. create or update a provider through page inputs
3. save the provider and confirm `Secret saved`
4. confirm provider readiness appears in the UI
5. toggle `connection checks` on and verify visible preflight behavior
6. toggle `connection checks` off and verify the preflight behavior is skipped
7. toggle `close behavior` and verify both hide-to-tray and quit behavior
8. open `Chat`
9. create a team from chat
10. open `Team`
11. edit the saved team template:
    - change description
    - change prompt constraints
    - change permission policy
    - add or remove assigned agents
12. launch a run from the existing team template
13. return to `Chat`
14. verify the run appears in the top tab strip
15. switch to the run tab and send a follow-up instruction
16. verify the run state and event feed update
17. restart the app
18. verify provider metadata remains, secret state remains, and workspace sessions recover

## Testing Strategy

### Backend

The backend must prove:

- provider metadata persists without plaintext secrets
- provider secrets round-trip through the keyring store
- secret migration clears plaintext SQLite token values
- `default provider` changes affect team creation and run execution
- `connection checks` alter provider-dependent execution behavior
- `close behavior` alters close policy
- team creation from Chat persists a team template
- team editing persists description, prompt constraints, permission policy, and agent assignments
- starting a team run creates durable run state
- workspace sessions list only `direct_chat` and `team_run`
- workflow commands are no longer registered

### Frontend

The frontend must prove:

- Chat exposes team creation as the primary entry
- Team page edits only existing teams
- Agents page remains the primary agent creation surface
- Team page can add and remove assigned agents
- Team page can launch a run but run execution remains in Chat
- Chat tab switching handles both direct chats and team runs
- Settings shows secret presence without revealing the secret
- visible provider-check events appear only when `connection_checks` is enabled

### Real Runtime Smoke

The real app must prove:

- provider save works through the UI
- secrets do not leak back into the UI or DB
- settings toggles change actual behavior
- team creation works from Chat
- team-template editing works from Team
- run execution and follow-up work from Chat
- restart recovery works

## Non-Goals

This iteration does not include:

- preserving workflow as a supported user flow
- returning plaintext secrets to the UI
- generic arbitrary shell or tool permission expansion at run time
- making every existing Settings field live in this same pass
- moving run execution onto the Team page
- creating agents from the Team page

## Recommendation

Implement the app as a strict session-first team runtime:

- `Agents` creates and owns agents
- `Chat` creates teams and hosts all conversation sessions
- `Team` stores and manages existing team templates
- `Settings` owns provider readiness and a small set of truly live settings
- provider secrets live in the OS keyring while SQLite stores only metadata
- workflow user flows and compatibility layers are removed rather than preserved

This is the smallest coherent product shape that satisfies the requested real-provider smoke path and leaves the codebase with one runtime model instead of two.
