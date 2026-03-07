# Rust/Tauri Desktop Rewrite Design

**Date:** 2026-03-06

## Summary

This project will be re-architected from a Go service + Next.js web + Slack/Discord adapter product into a pure desktop application built with `Tauri 2 + Rust core + React/TypeScript UI`.

The old Go runtime, REST product surface, and Next.js web product are no longer the target architecture. The new product is a local-first, tray-resident desktop studio where the user primarily interacts with `World Chat`, and all multi-agent collaboration is coordinated through `Workflow` rooms.

## Product Goals

- Replace the current `Go + REST + Web` product stack with a pure `Rust/Tauri` desktop app.
- Preserve remote command ingress through `Slack` and `Discord` while the desktop app is running.
- Keep the main experience `Chat-first`, with `World` as the primary interface.
- Redefine `Workflow` as a reusable multi-agent collaboration template, not a chain or BPMN-style flow.
- Make `Tools` a first-class capability layer, covering built-in tools, MCP tools, local CLI tools, and deeply integrated coding tools like `Codex` and `Claude Code`.
- Redesign `Memory` and add a real `Knowledge Base` for user-owned knowledge assets.
- Deliver a highly consistent desktop UI with a warm cream desktop palette, soft neutral panels, and restrained sage accents.

## Non-Goals

- Preserve backward compatibility with the Go runtime.
- Keep REST as a frontend communication layer.
- Continue shipping the Next.js web UI as the main product.
- Let users directly chat with individual agents inside a workflow.
- Model workflow as a linked execution graph or project-management kanban.

## Core Architecture

### Desktop Stack

- **Shell:** `Tauri 2`
- **Core Runtime:** Rust workspace crates
- **UI:** `React + TypeScript + Vite`
- **Primary storage:** `SQLite`
- **Secret storage:** `Stronghold`
- **Local files:** workspace artifacts, imported knowledge sources, tool outputs

### Rust Workspace Layout

Recommended new top-level structure:

```text
apps/
  desktop/
    src/
    src-tauri/
crates/
  nuka-domain/
  nuka-runtime/
  nuka-storage/
  nuka-tools/
  nuka-integrations/
  nuka-memory/
  nuka-knowledge/
```

### Runtime Layers

- **App Runtime** — lifecycle, tray, notifications, startup, configuration
- **World Runtime** — main chat entrypoint and routing logic
- **Workflow Runtime** — workflow templates, sessions, workflow-world coordination
- **Tool Runtime** — built-in, MCP, CLI, and integrated tool execution
- **Memory Runtime** — layered memory read/write and promotion logic
- **Knowledge Runtime** — import, indexing, binding, retrieval
- **Integration Runtime** — Slack, Discord, provider adapters

## Core Domain Model

### World Chat

`World Chat` is the primary user-facing interface. The user talks to `World`, and `World` decides whether to:

- answer directly,
- route the task into an existing workflow,
- create a new temporary workflow,
- ask for clarification,
- or request approval before risky actions.

### Workflow

A `Workflow` is **not** a chain of steps. It is a reusable multi-agent collaboration template.

A workflow contains:

- a set of agent presets,
- each agent's role,
- default tool access,
- default provider/model preferences,
- bound knowledge collections,
- memory scope rules,
- review/auto execution policy.

A workflow may be temporary or saved.

### Workflow Session

Each time the user enters a workflow, the app starts a **new session** based on that workflow template.

A workflow session:

- has its own temporary `Workflow World`,
- has its own session memory,
- records tool invocations and artifacts,
- does **not** resume the previous session transcript,
- may still access workflow shared memory if the workflow was saved.

### Workflow World

Inside a workflow session, the user talks only to the workflow's temporary `World` instance.

That workflow-world:

- receives user instructions,
- dispatches tasks to agent members,
- aggregates agent outputs,
- asks follow-up questions,
- summarizes progress and final results.

The user never directly chats with individual agents inside the workflow.

### Agent Preset

An `Agent Preset` is a reusable role/persona template. It defines:

- identity and persona,
- role description,
- prompt profile,
- provider/model preference,
- knowledge access,
- memory access,
- allowed tools,
- output style.

Agents are roleful collaborators, not independent top-level chat endpoints.

## Tools Model

`Tools` is the unified capability layer.

Tool categories:

- **Built-in Tools** — native app capabilities such as knowledge search, memory read/write, artifact save, workflow creation
- **MCP Tools** — tools discovered and executed through MCP servers
- **CLI Tools** — local executables such as `git`, `pnpm`, `cargo`
- **Integrated Tools** — deeply integrated coding tools such as `codex` and `claude code`

### Why Integrated Tools Are Special

Tools like `codex` and `claude code` are not just one-off shell commands. They require richer UX and runtime handling:

- explicit workspace/directory selection,
- structured task intent,
- long-running streaming output,
- artifact capture,
- stronger confirmation policy,
- better result visualization inside workflow sessions.

### Tool Binding Rules

An agent can bind to many tools.

Each `AgentToolBinding` defines:

- allow/deny,
- auto-run policy,
- review requirement,
- risk level,
- argument/environment templates,
- working directory strategy,
- output visibility.

### Default Output Policy for Integrated Tools

Outputs from deeply integrated tools like `codex` and `claude code` default to the current `Workflow Session` only:

- session artifact history,
- tool invocation history,
- event timeline.

They do **not** automatically become long-term memory or knowledge. Promotion into workflow memory or knowledge must be explicit.

## Memory and Knowledge Base

### Memory

Memory is system-retained context, not a raw document repository.

Memory layers:

- `Global User Memory`
- `Main World Memory`
- `Workflow Shared Memory`
- `Session Memory`
- `Agent Memory`

Promotion rule:

- session-local content stays local by default,
- validated or repeatedly useful conclusions may be promoted,
- saved workflows gain shared memory accessible to future sessions.

Primary `Memory` UX is a graph/schema view:

- layer switching reveals which memory tier is active,
- subject switching lets the user inspect a different owner such as `World`, `Workflow`, or an `Agent`,
- node inspection shows connected memory entities and promotion paths.

### Knowledge Base

The `Knowledge Base` is the user's long-lived source repository.

Normalized structure:

- `Library`
- `Collection`
- `Item`
- `Chunk`

Connector-first ingestion model:

- external connectors pull from GitHub, Notion, web docs, and local vaults,
- connectors own auth, sync scope, and source metadata,
- synced content is normalized into the local `Library -> Collection -> Item -> Chunk` model,
- chunking and retrieval operate on the normalized local layer instead of directly on remote APIs.

Sources include:

- files/folders,
- pasted notes,
- web imports,
- external synced connectors,
- workflow artifacts promoted by the user.

### Boundary Between Memory and Knowledge

- `Memory` = what the system remembers
- `Knowledge Base` = what the user owns as reference material

## Information Architecture

Top-level navigation:

- `Chat`
- `Workflow`
- `Agents`
- `Memory`
- `Knowledge`
- `Settings`

### Chat

Primary entrypoint. The user talks to `World`, sees world decisions, and can branch into workflows.

### Workflow

A workflow page is a collaboration room:

- center: workflow-world conversation,
- side columns: read-only per-agent activity and outputs,
- top bar: review/auto mode, memory scope, bound knowledge, tool status.

### Agents

Agent preset library with one-sentence quick-create. The primary action is a natural-language draft bar that produces role, provider profile, tool bindings, and memory/knowledge access before save.

### Memory

Graph-first scope manager with layer switching, subject switching, and node inspection for multi-level memory ownership.

### Knowledge

Connector-first knowledge hub for external sources plus the normalized local library model, sync status, chunk policy, and retrieval health.

### Settings

Provider/model hub plus app/runtime preferences. Providers are configured here once and reused by chat, agents, workflows, and knowledge ingestion.

## UX and Visual System

### Visual Direction

Keywords:

- calm,
- bright,
- fresh,
- professional,
- desktop-native,
- not cyberpunk.

### Color Direction

- **Primary surfaces:** warm cream / rice white
- **Secondary panels:** soft beige / parchment
- **Brand accent:** muted sage used sparingly for focus and status
- **Alert accents:** gentle amber and muted terracotta

### Layout Rules

Every primary page should share the same shell:

- left: global navigation,
- center: primary working surface,
- right: contextual inspector/details.

This is the main consistency rule across the app.

## Desktop Runtime Behavior

- The app runs as a tray-resident desktop application.
- Closing the main window minimizes to tray instead of exiting.
- Remote Slack/Discord integrations stay online while the app remains running.
- The app should support Windows, macOS, and Linux.

## Storage Strategy

- `SQLite` for business data and indices
- local file store for imported sources and artifacts
- `Stronghold` for secrets and tokens
- lightweight app config store for UI/runtime preferences

## Error Handling

Errors should be structured by source:

- user/configuration errors,
- tool errors,
- agent/provider errors,
- workflow orchestration errors,
- system/storage errors.

User-facing messaging should be concise in chat and detailed in contextual panels.

## Validation Strategy

Recommended validation layers:

- Rust unit tests for domain/runtime modules
- integration tests for providers/tools/workflow-world coordination
- Tauri command boundary tests
- targeted UI tests for chat/workflow/tools/knowledge
- manual verification for tray/background/remote integration flows

## Recommended UI/UX Skill Candidate

For the later implementation/design phase, a strong GitHub candidate is `nextlevelbuilder/ui-ux-pro-max-skill`, which currently shows high adoption and a large star count on GitHub. It appears to support Codex-oriented installation flows and provides design-system guidance that fits the upcoming `Pencil`-driven UI work.

Reference links:

- https://github.com/nextlevelbuilder/ui-ux-pro-max-skill
- https://github.com/openai/skills

## Final Product Definition

Nuka World becomes a pure desktop, Rust-native, local-first multi-agent studio:

- `World Chat` is the front door.
- `Workflow` is a reusable multi-agent collaboration template.
- Each workflow entry creates a new session.
- Saved workflows gain shared memory.
- Users talk only to `World` and workflow-world instances.
- Agents collaborate in the background.
- Tools are unified under a first-class tool system.
- `Memory` and `Knowledge Base` are separate but connected layers.
