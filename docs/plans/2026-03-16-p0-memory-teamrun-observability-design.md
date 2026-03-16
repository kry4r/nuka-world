# P0 Memory And Team Run Observability Design

Date: 2026-03-16

Supersedes:
- `docs/plans/2026-03-15-p0-desktop-ui-final-design.md` for the `Memory` page and the `Chat > Team run > Agents` / `Files` secondary views

## Goal

Correct the remaining P0 desktop UI surfaces that still read as placeholder dashboards instead of real operator views.

This design covers three approved changes only:

- `Memory` becomes a dynamic relationship graph instead of a board of cards
- `Chat > Team run > Agents` becomes a real per-agent execution view instead of a roster plus helper copy
- `Chat > Team run > Files` becomes a VS Code-like change explorer with a real diff preview when patch data exists

## Product Boundaries

- P0 only
- Desktop remains the only control plane
- `Chat` remains the only execution surface
- `Team` manages templates only
- `Agents` remains the primary creation surface for agents
- do not add mock runtime data, fake graph data, fake diff data, or fake UI paths
- do not introduce editor-grade code editing, freeform whiteboard editing, or P1/P2 observability features

## Shared UI Rules

These changes must inherit the current desktop shell language instead of feeling like a mini app embedded inside it.

- compact spacing
- flat controls
- toast-only non-blocking feedback
- no decorative helper paragraphs
- natural Chinese copy by default
- stable hover and focus states with no layout shifts

## 1. Memory

### Purpose

`Memory` should read as a relationship surface for one owner at a time, not as a dashboard of note cards.

### Layout

The page uses two persistent regions and one transient region:

- left `owner rail`
- center graph canvas
- node detail overlay or drawer on demand

There is no permanent right inspector column.

### Owner Rail

The left rail only filters the graph owner and does not try to explain the graph.

The rail structure is:

- `Direct chat`
- `Teams`

Rules:

- `Direct chat` is one shared owner
- each `team` is one peer owner
- owners are not grouped by session
- switching owner swaps the graph in place
- the rail remains visually lightweight and never competes with the graph canvas

### Graph Canvas

The graph canvas is the primary surface.

Visual direction:

- dark or near-dark canvas
- luminous round nodes
- thin relationship lines
- short labels beside or under nodes
- selected node and first-degree neighbors brighten
- non-relevant nodes dim

Default node presentation:

- dot plus short title
- no large rectangular cards
- no long body text on the canvas

Interaction rules:

- hover only highlights; it must not resize nodes or shift layout
- selection centers visual attention on the chosen node and its first-degree relationships
- pan, zoom, and fit-to-view remain available
- search and owner filtering act on the same graph surface instead of routing to another page

### Node Detail Overlay

Selecting a node opens a floating detail surface or drawer instead of a fixed sidebar.

The overlay may show:

- node title
- source or owner context
- relationship summary
- node body or summary
- compaction or consolidation hint when applicable

Closing the overlay should return the user to the same graph position.

### Data Truthfulness

The graph remains an owner-scoped relationship graph backed by real memory data.

Rules:

- do not invent nodes to make the graph look fuller
- do not merge owners into a global map
- do not fabricate graph edits or drag persistence if the runtime does not support them

### Non-Goals

- no whiteboard editor
- no arbitrary graph editing workflow
- no global memory universe view

## 2. Chat > Team Run > Agents

### Purpose

The `Agents` secondary view should let the user inspect what each runtime agent was told to do and what happened next.

### Layout

The view becomes a split work surface:

- left agent column
- right per-agent execution timeline

The bottom `follow up` composer remains fixed in the main team-run footer and does not move with the content height.

### Agent Column

The run contains:

- one coordinator or dispatcher agent
- multiple parallel execution agents

There is no parent-child hierarchy in this view.

Rules:

- the coordinator is pinned first and styled more strongly
- execution agents remain peer rows underneath
- each row shows agent name, role, and compact status
- the column scrolls independently from the right timeline

### Per-Agent Execution Timeline

The right side shows one unified time-ordered stream for the selected agent.

It combines:

- received instruction
- thinking
- reply
- tool call
- status change

These are not generic cards. Each event type needs a distinct visual treatment:

- `received instruction`: command strip from the coordinator
- `thinking`: collapsible reasoning card, collapsed by default
- `reply`: content-first chat bubble
- `tool call`: structured operation block with tool name, target, result, and state
- `status change`: lightweight state marker for `queued`, `blocked`, `waiting`, `resumed`, `retry`, or `completed`

Rules:

- the stream must read top to bottom as one working history
- no redundant helper labels like `Recent activity` or `Current work` when the card itself already communicates it
- hover and focus states must not change height or cause adjacent cards to jump
- the view must support long histories with an internal scroll region

### Copy And States

Default copy should sound like an actual desktop operator tool, not a translated admin template.

Examples:

- use direct labels like `收到指令`, `思考中`, `工具调用`, `状态变化`
- avoid filler copy that explains the obvious

### Non-Goals

- no agent creation form in this surface
- no hierarchy browser
- no separate subpages for conversation versus tool calls

## 3. Chat > Team Run > Files

### Purpose

The `Files` secondary view should let the user understand what changed during a run using a structure familiar to developers.

### Layout

The view becomes a two-column explorer:

- left file change tree
- right diff preview pane

### File Change Tree

The left side uses a VS Code-like change explorer pattern.

Rules:

- group by `round` or `batch`
- groups are collapsible
- file rows show change type, file name, relative path, agent, and timestamp
- use compact status markers like `A`, `M`, `D`, or `R`
- default-expand the latest relevant group and keep older groups collapsible

### Diff Preview Pane

The right side is read-only and designed for inspection, not editing.

If real patch or hunk data exists, render a diff-style preview with:

- line numbers
- add/remove coloring
- grouped hunks

If real patch data does not exist, the view must degrade honestly to:

- file metadata
- change summary
- triggering agent
- batch context

It must never fabricate a diff just to look complete.

### Non-Goals

- no full code editor
- no inline editing
- no synthetic diff reconstruction from guessed content

## 4. Shared Polishing Required For These Surfaces

- top tab overflow must remain horizontally scrollable
- hover states must never create clipping or overflow bugs
- large helper copy and repeated labels should be removed from touched surfaces
- Chinese should remain the default locale and read naturally

## 5. Verification Requirements

Each implementation checkpoint must be verified twice:

1. targeted automated tests
2. real Tauri MCP page review on the single desktop app instance

Review focus:

- visual hierarchy
- layout stability
- scroll behavior
- truncation
- hover and focus behavior
- empty and degraded states
- honesty of data presentation

## Acceptance Signals

This design is complete when:

- `Memory` looks and behaves like an owner-scoped relationship graph instead of a card board
- `Agents` reads as a per-agent execution history with clearly distinct event cards
- `Files` reads as a developer-grade change explorer with a truthful diff preview strategy
- no touched surface relies on fake state, fake data, or placeholder helper copy
