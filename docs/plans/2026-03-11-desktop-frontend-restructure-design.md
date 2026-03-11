# Desktop Frontend Restructure Design

Date: 2026-03-11

## Goal

Restructure the desktop frontend around a single clear primary task: start talking to Nuka immediately. Remove the current workbench-first framing, stop rendering persistent inspectors and shell-heavy empty states, and move advanced context into lightweight, conditional UI.

This redesign must stay grounded in the real backend surface that already exists in `apps/desktop/src-tauri/src/commands` and in the actual runtime behavior observed through Tauri MCP on 2026-03-11.

## Product Decisions

The following decisions are fixed for this redesign:

- `Chat` is the default entry page for every project.
- The first screen in `Chat` is only `logo + composer`.
- Chat mode selection does not live on the page by default. It moves behind a `+` entry point near the composer, similar to ChatGPT's attachment or mode affordances.
- `Workflow` remains a top-level page, but it is no longer a room-style workbench. It becomes a directory and explanation page.
- Workflow selection remains available from `Chat`, but the workflow catalog and workflow explanation live in `Workflow`.
- Persistent right-side inspectors are removed from all pages.
- Workbench layouts are removed as the default organization model.
- Empty states should prefer direct action surfaces over descriptive cards. If the action itself is obvious, do not add explanatory heading, description, or extra labels.
- `Settings` keeps clear sectioning, but uses a compact navigation list instead of large side cards.
- `Settings` does not auto-prioritize provider setup and does not show a runtime summary banner.
- `Knowledge` should be designed around the built-in `pageindex` engine instead of generic multi-console ingestion management.
- Verification must include Tauri MCP inspection of the real rendered app, not only unit tests or static review.

## Backend Ground Truth

The redesign is based on the real command surface, not projected architecture.

### Chat

- `route_world_prompt` routes the prompt into direct reply, existing workflow, or new workflow.
- `ChatModeInput` already supports `chat_only`, `create_workflow`, and `specific_workflow`.
- The command returns session metadata, route metadata, messages, provider metadata, and attached context placeholders.

### Workflow

- `start_workflow_session` and `continue_workflow_session` are real.
- Workflow sessions already produce structured events: user message, assistant message, and node event.
- Workflow origin is already preserved when a chat session hands off into workflow.

### Providers and runtime status

- `app_runtime_status` already exposes provider, knowledge, and app readiness.
- Provider CRUD and connection testing already exist through `list_providers`, `save_provider`, `delete_provider`, and `test_provider_connection`.

### Knowledge

- The default engine is `pageindex`.
- `pageindex` supports:
  - local folder connectors
  - indexing
  - retrieval
- Rebuild produces indexed document and connector counts plus a summary string.
- Search returns collection id, path, and snippet.
- Search behavior is content-driven, not connector-name-driven.
- Jobs already exist, but they are secondary operational metadata, not the main user task.

### Agents and memory

- Agents support list, save, delete, and draft generation.
- Memory supports graph loading and node/edge CRUD.
- These capabilities are real, but the current UI surfaces too much structure before the user has meaningful data.

## Information Architecture

The app should stop behaving like an architecture console and start behaving like a task-oriented desktop client.

### Primary product flow

The intended high-signal flow is:

1. Open project
2. Land in `Chat`
3. Talk directly, or attach a workflow context through the composer `+` menu
4. Move to `Workflow` only when the user needs to select, inspect, or improve a workflow
5. Return to `Chat` with the selected workflow context attached

`Agents`, `Knowledge`, `Memory`, and `Settings` are support pages. They must not visually compete with the main path.

### Conditional secondary regions

The product still needs editing, inspection, and context surfaces, but they should not be permanent columns. These surfaces should appear only when the current object justifies them.

Allowed forms:

- inline expandable sections
- embedded detail panels
- lightweight drawers
- anchored menus or popovers

Disallowed forms as the default state:

- permanent right-side inspectors
- three-column workbenches
- empty-state utility rails

## Chat Design

`Chat` becomes the canonical entry surface.

### Landing state

The landing state contains only:

- the Nuka logo
- the composer

It does not render:

- a page header
- a provider gate card
- a mode explanation block
- a mode switcher
- a context inspector

### Composer layout

The composer has three fixed parts:

- left: `+`
- center: prompt input
- right: send

The `+` menu is the only place where entry modes are exposed. The menu contains:

- `Direct chat`
- `Choose workflow`
- `Create workflow`

### Workflow context in chat

When a workflow is attached, `Chat` shows only a lightweight token near the composer. That token should support:

- viewing the current workflow name
- switching workflow
- clearing workflow context
- jumping to the workflow details page

The workflow token is context, not layout.

### Provider-missing behavior

When no provider is configured, `Chat` should remain visually identical to a usable chat surface.

Behavior:

- keep the composer visible
- anchor the provider warning to the composer interaction
- show only a short inline message and a lightweight `Open Settings` action
- avoid replacing the page with a blocked-state card

### Session state

After the first send:

- the landing logo contracts upward
- the message stream appears
- the composer remains fixed as the main action surface
- the workflow token remains attached if one is active

The page should look like the landing state growing into a conversation, not like a mode switch into a different product.

## Workflow Design

`Workflow` becomes a directory and explanation page, not a room or workbench.

### Page structure

- left column: workflow list
- right column: workflow detail

The right column is the main page content, not an inspector.

### If no workflows exist

Do not render a descriptive empty-state card.

Instead:

- keep the left side minimal
- present the direct workflow-generation action
- show the workflow creation input as the primary content

### Workflow detail model

The right column should explain a generated workflow in the clearest possible way. It should answer:

- what the workflow is for
- what order it runs in
- what it depends on
- where it pauses or changes phase
- how the user can improve it with natural language

### Workflow detail sections

#### 1. Overview

Keep this compact:

- workflow name
- one-sentence goal
- source, such as `generated from chat` or `revised from existing workflow`
- primary actions:
  - `Enter chat`
  - `Improve`

#### 2. Step flow

This is the dominant visual block.

Do not use a freeform node canvas. Use a restrained vertical sequence or step timeline.

Each step should explain:

- step name
- purpose
- executor
- input source
- output
- completion condition

Expanded detail may exist per step, but the default should remain readable in one scan.

#### 3. Dependencies

Keep dependencies grouped and secondary:

- agents
- tools and knowledge
- required extra inputs

Only show dependencies that materially affect execution. Do not surface placeholder categories or empty future bindings.

#### 4. Vibe improvement

Workflow improvement is a core product behavior. The user should improve workflows by describing changes naturally, not by editing a graph.

Minimum UI:

- a single input for change intent
- a few compact suggestion prompts
- a `Generate improved version` action

Suggested prompts:

- `Search the knowledge base before drafting`
- `Split the summary into review and publish stages`
- `Reduce manual confirmations`
- `Make the output more suitable for a product brief`

### Revision preview

Workflow improvement should not directly overwrite the current version. Show a lightweight preview first.

The preview should summarize:

- step changes
- dependency changes
- outcome changes

Actions:

- `Apply version`
- `Keep editing`

This keeps the workflow iteration feeling natural while preserving user trust.

## Settings Design

`Settings` should feel like a compact directory of local controls, not a gallery of explanatory cards.

### Layout

- left: compact section navigation
- right: current settings section

Recommended sections:

- `General`
- `Providers`
- `Appearance`
- `Shortcuts`
- `Runtime`

### Navigation behavior

The left navigation should behave like a settings directory:

- compact rows
- strong active state
- no oversized descriptive cards

### Section principles

- avoid top-level summary banners
- avoid runtime overviews
- keep descriptions minimal
- group fields by real user task

### Shortcuts

The shortcuts section should stay intentionally small.

Phase-one scope:

- common shortcut list
- global shortcut enable toggle if needed
- restore defaults action

Avoid building a complex keybinding editor in this pass.

## Agents Design

### Empty state

If no agents exist, show only the draft-generation action surface.

That means:

- one sentence input
- one generate action

No separate library card, editor card, or detail column.

### Populated state

Once agents exist:

- left: agent list
- right: agent detail and editing

The right side should hold the editable content directly. Do not duplicate it in a separate inspector.

## Knowledge Design

`Knowledge` should be explicitly designed around `pageindex`.

### Core product model

The core user tasks are:

- add local content
- rebuild the local index when needed
- search retrieved content
- inspect search hits by path and snippet

The page should not feel like a general-purpose engine console.

### Empty state

If no connector exists, the page should show only:

- folder path input
- add action

Do not show a multi-tab workbench.

### Populated state

Once connectors exist, the page should grow into two main zones:

- lightweight search area at the top
- source list and search results below

Search results should prominently use the data that `pageindex` actually returns:

- source path
- matched snippet
- knowledge collection name when useful

### Rebuild and jobs

`pageindex` rebuild is still important, but it is secondary.

UI treatment:

- keep `Rebuild index` near the source list or search area
- show the last rebuild outcome in a minimal inline form
- relegate job history and engine metadata into expandable secondary sections

### Engine-aware design

The page should acknowledge what `pageindex` really does:

- local folders
- normalized local document indexing
- snippet-based retrieval

The UI should therefore prefer:

- local path management
- supported file expectations
- retrieval-first result presentation

It should not prioritize:

- abstract engine diagnostics
- generic multi-engine tabs
- operational console framing

## Memory Design

### Empty state

If there are no nodes, do not render:

- graph utilities rail
- schema switchers
- zoom clusters
- node inspector

Use a minimal central graph entry surface.

### Populated state

Once graph content exists, the graph canvas becomes the main content area. Node detail should appear inline or in a temporary drawer, not in a permanent right column.

The graph is the content. The UI chrome around it should remain secondary.

## Visual and Interaction Direction

This redesign is deliberately subtractive.

### Keep

- the existing warm neutral palette family
- the current general brand direction
- the sense that the desktop client is local and quiet

### Remove or reduce

- large explanatory cards
- repeated copy across header, body, and side rail
- permanent panels with no active object
- layouts that expose architecture before task

### Interaction rules

- one dominant action per screen
- hidden advanced controls until requested
- lightweight transitions
- visible but restrained focus states

## Backend Additions Needed After Frontend Restructure

The frontend can begin simplifying immediately, but the full design requires new backend support.

### Required additions

#### Workflow catalog response

Expose workflow summaries in a format meant for a left-column catalog, not only hard-coded definitions.

#### Workflow explanation response

Return a readable workflow explanation model:

- overview
- ordered steps
- dependencies
- boundaries or pause points

#### Workflow revision response

Accept a natural-language revision prompt and return:

- updated workflow version
- summary of changes
- dependency deltas

#### Workflow chat context selection

Allow chat to explicitly attach, clear, or switch workflow context without relying only on static mode selection behavior.

## Verification Requirements

Verification must include both local tests and real-page inspection.

### Required real-app inspection

Use Tauri MCP to validate actual page rendering and actual layout behavior. This is mandatory for this redesign because many of the current problems are visible only in the live app.

### Required Tauri MCP checks

- `Chat` first load with no provider configured
- `Chat` first load with provider configured
- `Chat` after attaching a workflow
- `Workflow` with existing workflows
- `Workflow` with no workflows
- `Agents` with no agents
- `Knowledge` with no connectors
- `Knowledge` after adding a connector and rebuilding `pageindex`
- `Memory` with no nodes
- `Settings` navigation and section behavior

### UI acceptance checks

- `Chat` first view shows only logo and composer as the dominant elements
- mode controls do not render until the composer `+` action is used
- provider-missing state does not replace the whole page with a blocking card
- no page renders a permanent right inspector
- no empty page renders a fake workbench shell
- `Workflow` reads as list plus explanation, not room plus context console
- `Knowledge` reads as pageindex-backed retrieval UI, not an engine admin console
- settings sections remain compact and scannable

## Implementation Order

The frontend should be restructured in this order:

1. remove permanent inspectors and workbench-first empty states
2. rebuild `Chat` landing and composer mode entry
3. rebuild `Workflow` into catalog plus explanation
4. simplify `Settings` navigation and section presentation
5. simplify `Agents`, `Knowledge`, and `Memory`
6. add workflow explanation and workflow revision backend support
7. validate in Tauri MCP against real runtime states

## Non-Goals

This pass should not:

- introduce a drag-and-drop workflow builder
- create a full shortcut editor
- over-design empty states with decorative filler
- add speculative surfaces for future features
- retain the current inspector-driven layout under a different visual treatment
