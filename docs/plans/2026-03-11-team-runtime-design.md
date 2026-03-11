# Team Runtime Design

Date: 2026-03-11

## Goal

Replace the current static workflow facade with a real temporary-to-persistent team system that closes the loop from provider setup, to chat, to team creation, to multi-agent execution.

The product target for this iteration is:

- the user configures a real provider
- the user can run multiple chat sessions in parallel
- the user can create a team from a goal
- the team is persisted immediately and can be edited or deleted
- the user can start one or more runs from that team
- each run appears as a real session inside Chat tabs
- the user can watch agent progress, inspect meeting-style coordination, and append new instructions
- the runtime avoids uncontrolled token burn through an explicit coordination charter

This design intentionally does not prioritize saved workflow templates. The existing user-facing term `Workflow` should move back to `Team`.

## Product Decisions

The following decisions are fixed for this design:

- User-facing naming changes from `Workflow` to `Team`.
- A `Team` is a persistent definition, not a temporary draft.
- Creating a team from a goal persists it immediately.
- The user may edit or delete a team before or after runs exist.
- A `TeamRun` is a separate persisted execution instance created from a team snapshot.
- `Chat` is the unified execution surface and supports multiple parallel sessions through top tabs.
- `Team` is the definition and launch surface. It is not the primary execution surface.
- A run may accept follow-up instructions while active.
- A run may add new agents while active.
- Existing agents in an active run may not have their responsibilities edited.
- The runtime should feel like a structured meeting between agents, not a linear pipeline and not a freeform graph canvas.
- Agent collaboration must be governed by explicit budget and turn-taking rules to constrain token use.
- Provider configuration may come from normal saved settings or an env-backed import flow.

## Current State And Problem

The current implementation is split across a real provider-backed chat path and a mostly synthetic workflow path.

Important current code paths:

- Frontend static workflow definitions live in `apps/desktop/src/lib/workflow.ts`.
- The current workflow page is an explanation and revision surface in `apps/desktop/src/features/workflow/WorkflowPage.tsx`.
- The backend workflow runtime is an in-memory room model in `crates/nuka-runtime/src/workflow.rs`.
- The current workflow commands in `apps/desktop/src-tauri/src/commands/workflow.rs` are built around explanation, preview, start, and continue.
- Provider CRUD and settings are already real in `apps/desktop/src-tauri/src/commands/providers.rs` and `apps/desktop/src-tauri/src/commands/settings.rs`.
- Normal chat sessions are already persisted through `crates/nuka-storage/src/chat.rs`.

This creates three mismatches:

1. The user wants teams, but the product still speaks in workflows and explanations.
2. Chat sessions are real, but workflow sessions are closer to synthetic rooms than durable execution artifacts.
3. The UI can imply rich multi-agent orchestration without a real contract for team state, agent state, or budget control.

## Core Model

This iteration should center the product on four core objects.

### Provider

`Provider` remains the execution prerequisite.

- It defines the reachable LLM endpoint and model.
- It is resolved through Settings.
- It gates chat and team run execution.

### Team

`Team` is a persistent, user-visible object created from a natural-language goal.

It must include:

- `id`
- `name`
- `goal`
- `summary`
- `successCriteria`
- `coordinationPolicy`
- `createdAt`
- `updatedAt`
- `status`
- `agents`

`Team` is created immediately from a goal and can then be edited.

### Team Agent

Each team contains a persistent list of agent definitions. A team agent must include:

- `id`
- `teamId`
- `name`
- `role`
- `responsibility`
- `systemPrompt`
- `toolBindings`
- `toolUsePolicy`
- `orderHint`
- `createdAt`
- `updatedAt`

The user can edit, add, and delete these agents at the team-definition stage.

### Team Run

`TeamRun` is a persisted execution instance launched from a team snapshot.

It must include:

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

The run snapshot must be durable even if the source team changes later.

### Team Run Agent

When a run starts, the runtime freezes the participating agents into run-local copies.

Each run-local agent must include:

- `id`
- `runId`
- `sourceTeamAgentId` nullable
- `name`
- `role`
- `responsibility`
- `systemPrompt`
- `status`
- `currentWork`
- `joinedAt`

This snapshot model is required so that:

- deleting a team does not destroy historical runs
- updating a team definition does not mutate prior runs
- newly added runtime agents can be represented without rewriting the source team

Each run-local agent must also keep:

- `toolBindings`
- `toolUsePolicy`
- `lastToolActivity`

### Workspace Session

`Chat` should treat the top tab strip as a workspace session switcher.

A workspace session is either:

- `direct_chat`
- `team_run`

Each session entry must include:

- `id`
- `kind`
- `title`
- `status`
- `updatedAt`

The tabs must be backed by real storage or a real backend projection, not only React state.

## Information Architecture

### Chat

`Chat` becomes the unified execution page.

Its responsibilities are:

- host multiple active sessions through top tabs
- render direct chat sessions
- render active team runs
- allow the user to append instructions to the active session
- show live agent participation for team runs

When the selected session is a normal chat, the page behaves like a normal conversation surface.

When the selected session is a team run, the page becomes a meeting-like execution surface with:

- a top agent strip
- a run charter summary
- a structured event feed
- a bottom composer for follow-up instructions and runtime agent addition

### Team

`Team` replaces the current workflow explanation page.

Its responsibilities are:

- create a team from a goal
- list existing teams
- load and edit a team definition
- show the team mission and agent responsibilities
- start a run from a selected team
- delete a team

It is not a linear step-flow page and not a room UI.

### Settings

`Settings` remains the provider configuration surface.

It must still support:

- provider CRUD
- default provider selection
- connection testing

It should also expose an explicit env import flow for provider metadata and secrets, without silently overriding saved settings.

## Team Creation Flow

The first-run creation path should be:

1. User opens `Team`.
2. User enters a goal.
3. Frontend calls `create_team_from_goal(goal)`.
4. Backend uses the configured provider to generate:
   - team name
   - team summary
   - success criteria
   - coordination policy
   - initial agent list with responsibilities
5. Backend persists the team and agents immediately.
6. Frontend loads the created team into the editor surface.
7. User may:
   - rename the team
   - adjust summary or success criteria
   - edit agent responsibilities
   - add or delete agents
8. User starts a run from that saved team.

If no provider is configured:

- team creation should fail honestly
- the page should render an inline action leading the user back to provider setup

The design does not include an unsaved-draft layer.

## Team Execution Flow

The run flow should be:

1. User clicks `Start Run` on a selected team.
2. Frontend calls `start_team_run(teamId)`.
3. Backend snapshots the team and its agents into run-local tables.
4. Backend creates a run charter.
5. Backend creates initial execution events.
6. Frontend navigates to `Chat`.
7. `Chat` adds or refreshes a `team_run` tab and activates it.
8. User observes the run, appends instructions, or adds a new runtime agent.

The active run view inside Chat should be the primary place where the user spends time after launch.

## Run Charter And Multi-Agent Protocol

The runtime should not allow uncontrolled all-to-all discussion. The coordination model should be meeting-like, moderated, and budget-aware.

Each run must persist a `RunCharter` object containing at least:

- `goal`
- `successCriteria`
- `outputFormat`
- `currentPhase`
- `maxRounds`
- `maxActiveAgentsPerRound`
- `maxMessagesPerAgentPerRound`
- `budgetPolicy`
- `stopConditions`

### Coordinator Role

Each run must have a coordination role. This may be an explicit run-local agent or a runtime-only role, but the product behavior must exist.

The coordinator is responsible for:

- creating the agenda for each round
- selecting which agents participate in the current round
- limiting the number of concurrent speaking agents
- deciding whether a disagreement requires review or rebuttal
- writing the checkpoint summary
- deciding whether the run should finish, continue, or pause for user input

### A2A/A2As Meeting Model

The runtime should support two controlled collaboration modes:

- `directed`
  - one agent requests review, evidence, or critique from another agent
- `moderated_group`
  - the coordinator convenes a small group discussion for a bounded round

The runtime should not support uncontrolled global broadcast where every agent continuously sees and answers every message.

### Execution Cycle

A single run loop should follow this pattern:

1. The coordinator reads the goal, the latest checkpoint summary, and the user follow-up if present.
2. The coordinator writes an agenda for the round.
3. The coordinator selects one to three agents to participate.
4. Selected agents each emit one concise position card:
   - what they believe
   - what evidence or reasoning supports it
   - what action they recommend
5. If positions conflict, the coordinator may trigger a bounded review exchange.
6. The coordinator produces a compressed checkpoint summary.
7. The runtime evaluates stop conditions:
   - completed
   - continue
   - waiting for user
   - budget paused

This gives the user a visible meeting-like discussion without unbounded token churn.

## Token And Budget Control

Token discipline is a product requirement, not a late optimization.

The runtime must enforce these defaults:

- maximum 3 active agents in one round
- each active agent gets one primary message per round
- one optional follow-up message only if the coordinator requests it
- agents should read the latest checkpoint summary instead of the full transcript by default
- full transcript replay is opt-in and coordinator-controlled
- review loops may only open when there is a concrete conflict, missing evidence, or output-format failure
- each round must end with a compressed checkpoint summary

When budget pressure rises, the runtime should not silently continue. It should emit a `budget_warning` event and either:

- pause and wait for user input
- or finalize the best available answer if completion criteria are already close enough

### New Runtime Agents

A run may add a new agent during execution, but the new agent must not receive the full historical transcript by default.

Instead, the runtime creates an onboarding packet containing:

- run goal
- current phase
- latest checkpoint summary
- reason for joining
- assigned responsibility

This packet constrains context growth and keeps late joiners cheap.

## Chat Page Design For Team Runs

When the active tab is a `team_run`, `Chat` should render three layers.

### 1. Session Tabs

The top strip should display all real workspace sessions.

Each tab should show:

- title
- session kind
- current status

The user should be able to switch between several direct chats and several team runs without page reload or lost state.

### 2. Agent Team Strip

Directly below the tabs, the page should render an `Agent Team Strip` similar to a meeting attendee bar.

Each agent card should show:

- agent name
- state
- short current-work summary

Allowed state labels:

- `thinking`
- `drafting`
- `reviewing`
- `waiting`
- `blocked`
- `done`

Examples of current-work summaries:

- `Breaking down the goal`
- `Reviewing evidence conflicts`
- `Drafting the final answer`
- `Waiting for coordinator`

One agent must be visually highlighted as the current lead or current speaker.

### 3. Run Event Feed

Below the team strip, the page should render a structured feed of execution events.

It should prioritize:

- who is doing work
- what changed
- what decision was made

The feed should not look like a pure transcript dump and should not default to a linear workflow timeline.

### Bottom Composer

The bottom composer should support:

- user follow-up instructions
- add-agent flow

It should not allow editing existing run agents.

## Team Page Design

The `Team` page should have a simple two-region layout:

- a left team list
- a right team editor/detail surface

The right side should include:

- name
- goal
- summary
- success criteria
- coordination policy
- agent list
- agent tool permissions
- actions: `Save Changes`, `Start Run`, `Delete Team`

The agent list is the dominant content block.

Each agent row or card should show:

- name
- role
- responsibility
- editable system prompt or prompt summary
- allowed tools

Tool bindings are explicit. An agent should not implicitly gain access to every runtime capability.

There is no first-class linear step flow in this page. Team behavior should be described as collaboration strategy, not as a fixed pipeline.

## Command Surface

The current workflow-oriented command surface should be replaced or superseded by a team-oriented command surface.

Required commands:

- `create_team_from_goal(goal)`
- `list_teams()`
- `load_team(teamId)`
- `update_team(team)`
- `delete_team(teamId)`
- `start_team_run(teamId)`
- `load_team_run(runId)`
- `continue_team_run(runId, prompt)`
- `add_team_run_agent(runId, agentSpec)`
- `list_workspace_sessions()`
- `load_workspace_session(sessionId, kind)`
- `list_tool_registry()`
- `load_tool_policy(toolName)`

Provider and settings commands remain:

- `list_providers`
- `save_provider`
- `delete_provider`
- `test_provider_connection`
- `load_settings`
- `save_settings`
- `app_runtime_status`

The current commands that should stop defining the user flow are:

- `explain_workflow`
- `revise_workflow`
- `start_workflow_session`
- `continue_workflow_session`

These may remain temporarily for transition, but the main UI should no longer depend on them.

## Storage Design

Existing `chat_sessions` and `chat_messages` can continue serving normal chat.

This iteration needs new durable tables for team definitions and execution.

Minimum schema additions:

- `teams`
  - `id`
  - `name`
  - `goal`
  - `summary`
  - `success_criteria`
  - `coordination_policy`
  - `status`
  - `created_at`
  - `updated_at`
- `team_agents`
  - `id`
  - `team_id`
  - `name`
  - `role`
  - `responsibility`
  - `system_prompt`
  - `tool_bindings_json`
  - `tool_use_policy_json`
  - `order_hint`
  - `created_at`
  - `updated_at`
- `team_runs`
  - `id`
  - `team_id`
  - `title`
  - `goal`
  - `status`
  - `current_phase`
  - `lead_agent_id`
  - `charter_json`
  - `created_at`
  - `updated_at`
- `team_run_agents`
  - `id`
  - `run_id`
  - `source_team_agent_id`
  - `name`
  - `role`
  - `responsibility`
  - `system_prompt`
  - `tool_bindings_json`
  - `tool_use_policy_json`
  - `status`
  - `current_work`
  - `last_tool_activity`
  - `joined_at`
- `team_run_events`
  - `id`
  - `run_id`
  - `kind`
  - `agent_id`
  - `title`
  - `content`
  - `status`
  - `tool_name`
  - `tool_call_id`
  - `tool_target`
  - `sequence`
  - `created_at`

No template versioning system is required in this iteration.

## Session Recovery

The Chat tab strip must recover real sessions when the app restarts.

This means:

- direct chats must remain discoverable through their persisted session tables
- team runs must remain discoverable through their run tables
- the workspace-session list should be a backend projection over both stores

The frontend must not assume that tabs live only in local component state.

## Provider Strategy

The primary provider path remains Settings-driven configuration.

Supported approaches for this iteration:

### Saved Provider

The user manually configures the provider in Settings.

Fields:

- name
- base URL
- model
- API key

### Env-Backed Provider Import

The product may also support an explicit `Import From Env` action.

Recommended environment variables:

- `NUKA_PROVIDER_NAME`
- `NUKA_PROVIDER_BASE_URL`
- `NUKA_PROVIDER_MODEL`
- `NUKA_PROVIDER_API_KEY`

Design rules:

- env import must be explicit, not silent
- env-backed providers should preserve metadata in storage
- secrets may be resolved from env at runtime instead of being written back in plain form
- failures from missing env data must surface clearly through Settings and runtime execution

The execution surfaces do not care whether the provider came from manual entry or env import. They only depend on successful provider resolution.

## Explicit Agent Tool Interface

Tool use is a first-class part of the team contract.

Each agent must have explicit tool bindings rather than vague descriptive capability text. The runtime must know what the agent is allowed to invoke, and the UI must show those bindings clearly.

### Tool Binding Model

Each agent binding should include:

- `toolId`
- `adapterKind`
- `allowed`
- `purpose`
- `costClass`
- `requiresApproval` if needed later

Recommended adapter kinds for this iteration:

- `mcp`
- `cli`
- `integrated_agent`

Recommended initial tool ids:

- `mcp:*` for MCP-exposed capabilities
- `cli:*` for explicit shell command families
- `codex`
- `claude_code`
- `opencode`
- `search_knowledge`
- `git`

The current repository already has early tool concepts in `crates/nuka-tools` and `apps/desktop/src-tauri/src/commands/tools.rs`. This design should extend that direction rather than invent a parallel tool model.

### Why Explicit Tool Bindings Matter

The agent model should not imply that every agent can:

- search the workspace
- run shell commands
- call MCP servers
- invoke external coding agents

Those permissions materially change both cost and risk. They must be visible and controlled.

### Team Creation And Editing

When a team is generated from a goal, the provider-backed generation step should also propose initial tool bindings for each agent.

Examples:

- a research agent may get `search_knowledge`
- a coding agent may get `codex` and `git`
- a runtime inspector may get selected `mcp:*` tools
- an ops agent may get a constrained `cli:*` binding

The user must be able to adjust tool bindings on the Team page before starting a run.

### Tool Invocation Events

The run feed must represent tool activity as explicit events, not hidden inner reasoning.

Recommended event additions:

- `tool_call_requested`
- `tool_call_started`
- `tool_call_completed`
- `tool_call_failed`

Each should include:

- which agent initiated it
- which tool was used
- what the tool was used for
- whether it succeeded
- a concise result summary

This makes the team execution page legible: the user can see not only discussion, but also when an agent left the meeting lane to actually do work.

### Tool Activity In The Agent Strip

The `Agent Team Strip` should surface tool work directly.

Examples of current-work summaries:

- `Using search_knowledge`
- `Running codex on patch plan`
- `Inspecting runtime through MCP`
- `Executing CLI diagnostics`

This is better than showing only abstract statuses like `thinking`, because it reveals that the agent is taking a concrete action.

### Integrated External Agent Sessions

Some tools are not ordinary deterministic utilities. `codex`, `claude_code`, and `opencode` are closer to delegated agent sessions than plain functions.

For this iteration they should still be treated as explicit tool adapters with:

- a visible tool id
- a defined output scope
- a summarized invocation result

The runtime should not embed their entire hidden transcript into the main run context by default. Instead it should pull back:

- a compact artifact summary
- key outputs
- any file or workspace impact

This prevents nested-agent execution from exploding the context window.

## Tool Budget And Safety

Agent tool access must be constrained separately from language-model token access.

Required controls:

- per-run maximum number of external tool calls
- per-round maximum number of tool calls
- tool-specific cooldowns for expensive adapters if needed
- summarized tool output by default instead of raw transcript replay
- explicit distinction between low-cost and high-cost tools

Recommended cost classes:

- `low`
  - local knowledge search
  - lightweight MCP reads
- `medium`
  - constrained CLI diagnostics
  - lightweight git inspection
- `high`
  - delegated external coding agents such as `codex`, `claude_code`, `opencode`

The coordinator should consider tool budgets when setting the round agenda. A run should not allow every participating agent to call a high-cost tool in the same round unless the agenda explicitly requires it.

### CLI Boundaries

If CLI-backed tools are allowed, they must not be represented as arbitrary unrestricted shell access in the product model.

Instead, the design should treat them as named command families or pre-approved command scopes, for example:

- `cli:git-read`
- `cli:test-runner`
- `cli:workspace-search`

This keeps the contract understandable and reviewable.

### MCP Boundaries

MCP-backed tools should likewise be represented as explicit tool ids or scopes, not as an invisible universal ability.

Examples:

- `mcp:filesystem`
- `mcp:fetch`
- `mcp:browser-inspect`

The UI should not need to display every raw MCP capability, but the agent definition must still know which categories it may use.

## State Machine

### Team State

Recommended team states:

- `ready`
- `archived`
- `deleted`

### Team Run State

Recommended run states:

- `active`
- `waiting_for_agents`
- `waiting_for_user`
- `budget_paused`
- `completed`
- `failed`

### Run Agent State

Recommended runtime agent states:

- `thinking`
- `drafting`
- `reviewing`
- `waiting`
- `blocked`
- `done`

## Error Handling

The runtime must fail honestly.

Required behaviors:

- if no default provider exists, team creation and team run start must fail clearly
- deleting a team must not delete historical runs
- updating a team must not mutate existing run snapshots
- if one agent fails during a run, the coordinator decides whether to retry, skip, replace, or pause
- if the run budget is exceeded, the run should transition to `budget_paused`
- if a tool call fails, the failure must be logged as an explicit run event and attributed to the initiating agent
- if a high-cost external agent tool is unavailable, the coordinator should be able to continue with fallback reasoning instead of always failing the whole run
- a completed run may accept a user follow-up and return to `active` for another round
- if storage recovery finds corrupted run state, the run should surface as `failed` with a readable error message

## Frontend Contract Notes

The frontend should stop using hard-coded workflow definitions as the primary source of truth.

Transition implications:

- `apps/desktop/src/lib/workflow.ts` should be replaced or renamed into a team-oriented client module
- the `WorkflowPage` feature should be redesigned as `TeamPage`
- `ChatPage` should learn to render a union of direct-chat and team-run sessions
- the unused `WorkflowRoom` component should be reconsidered against the new run-execution view, not retained as-is

The frontend should not fabricate agent states, session tabs, or run summaries. These must come from real command payloads.

The same applies to tool use. The frontend should not invent tool badges or fake tool activity. Agent tool availability and tool-call events must come from backend-owned payloads.

## Verification Requirements

### Backend

The backend must prove that:

- `create_team_from_goal` persists a team and agents
- team CRUD works end-to-end
- team generation persists proposed agent tool bindings
- `start_team_run` persists run metadata, frozen run agents, charter data, and initial events
- `continue_team_run` advances the run and appends real events
- `add_team_run_agent` persists the new runtime agent with onboarding context
- tool invocation events are persisted and attributed correctly
- workspace session listing merges direct chats and team runs
- deleting a team leaves historical runs readable
- provider failures surface clearly during team creation and run start
- budget warnings transition runs into `budget_paused`

### Frontend

The frontend must prove that:

- Chat tabs can display multiple direct chats and multiple team runs
- selecting a team-run tab renders the agent team strip
- the current lead agent is visibly highlighted
- agent cards display status and current work
- the Team page can create a team from a goal and then edit it
- the Team page shows and edits explicit agent tool bindings
- starting a run returns the user to Chat with the new run tab active
- the run page can append instructions and add an agent
- the run page displays real tool activity in the event feed and agent strip
- provider errors and budget warnings are shown from real command failures and payloads

### Real Runtime Smoke

Real app verification must cover:

- configure a provider through Settings or explicit env import
- create a team from a goal
- edit one generated agent
- start a first run
- observe agent state changes in Chat
- append a follow-up instruction
- add a new runtime agent
- create a second team run in parallel
- keep at least two direct chats and two team runs visible in tabs
- restart the app and verify session recovery

## Non-Goals

This iteration does not include:

- saved workflow template management as the primary model
- drag-and-drop workflow graphs
- editing existing runtime-agent responsibilities in-place
- unbounded all-agent group chat
- native Anthropic provider support
- fully generic orchestration DSLs

## Recommendation

Implement the product as a session-first team runtime:

- `Settings` owns provider readiness
- `Team` owns persistent team definition and launch
- `Chat` owns active execution through multi-session tabs
- `TeamRun` owns meeting-style multi-agent execution with bounded A2A/A2As coordination

This is the narrowest model that still satisfies the product goal and leaves a clean path for future template saving, richer orchestration, and more advanced runtime introspection.
