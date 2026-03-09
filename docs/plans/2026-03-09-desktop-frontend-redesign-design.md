# Desktop Frontend Redesign Design

**Date:** 2026-03-09

## Summary

This redesign replaces the current card-heavy desktop UI with a true desktop workbench built around `Chat` and `Workflow`, while preserving the warm cream and black product tone. The app is not a marketing page or a generic dashboard. It is a local-first AI workspace where the user starts in `World Chat`, explicitly chooses the conversation mode, then moves into a dedicated workflow room when the task becomes structured.

The redesign keeps the existing Tauri + React + TypeScript stack, preserves real backend integrations, swaps the product mark to `apps/desktop/src/assets/nuka.svg`, and removes fake hierarchy that currently makes every page feel like the same stack of rounded cards.

## Product Priorities

1. Make `Chat` the strongest and clearest page in the app.
2. Give `Workflow` its own conversation room instead of treating it as a form launcher only.
3. Redesign `Memory` as a real graph workbench, not a list reader.
4. Keep `Knowledge` expandable for `PageIndex` plus future RAG engines without turning it into the main product story.
5. Preserve the warm cream and black palette, but rebuild the hierarchy, typography, and state system.

## Problems In The Current UI

- Most pages reuse the same `SectionHeader + Card + Card grid + Inspector card stack` pattern, so page identity is weak.
- Decorative surfaces outnumber meaningful surfaces. Visual weight is spent on wrappers instead of tasks.
- `Card` currently acts as container, summary, status, error, empty state, and detail block. This collapses hierarchy.
- The shell, content panels, and inspector all compete for the same visual layer.
- `Chat` looks like a styled message page, not the front door to the whole system.
- `Workflow` does not yet feel like a structured room with progression and conversation.
- `Memory` does not express the graph-based mental model that the product needs.

## Design Direction

### Overall Tone

Use a restrained desktop workbench:

- quiet and professional, not glossy,
- warm and tactile, not sterile,
- strong task hierarchy,
- modest use of status color only where state really matters.

This is the approved mix:

- **Base:** `Restrained Workbench`
- **Selective status emphasis:** only on `Workflow`, `Knowledge`, and parts of `Agents`
- **Editorial restraint:** only on `Chat` landing and major page titles

### Visual System

#### Color

Keep the primary palette within a warm neutral family:

- canvas background: warm paper / ivory
- primary surfaces: slightly cleaner cream
- utility surfaces: muted warm gray-beige
- main text: ink black / deep charcoal
- borders: light warm gray

Status colors are secondary and low saturation:

- ready / healthy: muted sage
- running / indexing: gray-gold / amber
- error: restrained terracotta

Avoid:

- purple-blue AI gradients
- oversaturated accent colors
- multiple competing highlight colors
- repeating cream-on-cream surfaces without hierarchy

#### Typography

Use a three-font hierarchy:

- display / page titles / hero: `Newsreader`
- interface / controls / navigation / body: `IBM Plex Sans`
- ids / paths / engine names / job statuses: `IBM Plex Mono`

Rules:

- do not use serif everywhere,
- use serif only where product tone and emphasis matter,
- keep high-frequency interaction surfaces in sans,
- use mono only for technical values and logs.

#### Brand

- Replace `goodlogo.png` in the product chrome with `apps/desktop/src/assets/nuka.svg`.
- Keep `apps/desktop/src/assets/nuka.png` only as a bitmap fallback or preview asset.
- Rebuild the brand lockup around the new mark instead of embedding a static raster lockup.

## Shell Architecture

The shell becomes a stable three-zone desktop frame:

- **Left rail:** primary navigation and lightweight runtime state
- **Main task surface:** page-specific workspace
- **On-demand inspector:** contextual details, not a permanent stack of cards

### Left Rail

The left rail remains the main navigation because the app has six persistent task domains:

- Chat
- Workflow
- Agents
- Memory
- Knowledge
- Settings

The rail contains:

- top brand lockup,
- navigation group,
- bottom runtime state,
- settings entry anchored consistently.

The rail must feel lighter and more architectural than the current soft sidebar panel.

### Main Task Surface

The central pane is no longer a large wrapper card. Each page owns its structure directly. A page should create its own main hierarchy instead of being wrapped in the same content panel abstraction.

### Context Inspector

The inspector becomes a contextual utility space. It opens when there is useful secondary information:

- session metadata,
- provider details,
- workflow node detail,
- memory node editing,
- knowledge result detail,
- settings guidance.

It should not mirror the main content or duplicate page summaries.

## Chat Design

`Chat` is the front door to the product.

### Core Model

Before sending a message, the user explicitly selects one mode near the composer:

- `Chat only`
- `Create workflow`
- `Specific workflow`

This mode is first-class product state. It is not hidden inside a menu.

### Chat Landing

The landing state contains:

- brand mark and product lockup,
- centered composer,
- explicit mode switcher,
- optional lightweight quick actions.

The landing should feel calm, intentional, and focused on starting work.

### Chat Conversation

After the first message:

- top status strip shows mode, provider, route, session summary,
- transcript shows user and `World` conversation,
- composer remains fixed at the bottom,
- the inspector shows contextual metadata only when useful.

### Three-Choice Suggestion Flow

The product already has a three-way guidance logic that should feel like `brainstorming` or `superpower` style decision support.

Design requirements:

- suggestions appear as a stage-aware layer above the composer,
- each option is a full next-step recommendation, not a one-word chip,
- selecting an option writes the decision into the transcript as a real action,
- old suggestions are replaced by new ones rather than accumulating.

This layer is part of the core Chat experience.

### Chat To Workflow Handoff

When the current mode is `Create workflow`, Chat is responsible for clarifying and shaping the task. Once the workflow is concrete enough, Chat presents a clear transition block that sends the user into the dedicated workflow room.

When the mode is `Specific workflow`, the user selects the workflow before sending the message, and the conversation should move into the workflow room after the first send.

## Workflow Design

`Workflow` is not just a launcher. It is a structured task room.

### Workflow Lobby

Before a workflow session starts, the page shows:

- workflow list or selector,
- current workflow description,
- required inputs,
- start or continue actions,
- inspector guidance.

This area should be lightweight and utilitarian.

### Workflow Room

Once a workflow session is active, the page becomes a conversation room with structure.

The room includes:

- a top workflow status strip,
- a main transcript for user and LLM conversation,
- embedded workflow events and node blocks,
- a secondary execution/timeline layer,
- an inspector for node, tool, and session details.

`Workflow` differs from `Chat` in that it must surface progress, state, and execution events more strongly.

### Event Types

Workflow transcript content includes:

- user messages,
- LLM / workflow-world replies,
- workflow node events,
- tool output events,
- approvals or blockages,
- completion summaries.

These must not be rendered as ordinary chat bubbles.

## Memory Design

`Memory` becomes a graph workbench.

### Product Role

Memory is a real graph-based system, not a simple scope list. The page should support graph inspection and eventual node editing and deletion.

### Layout

- left utility controls: filters, search, graph legend, view mode
- center graph canvas: pan, zoom, focus, fit view
- right inspector: node detail, relation detail, edit form, delete controls

### Graph Strategy

Default to a focused graph view:

- selected node centered,
- first-degree neighbors emphasized,
- second-degree neighbors softened,
- optional full-map mode later.

This is more usable than throwing the whole graph into a force layout by default.

### Editing

The target UX includes:

- edit node title and body,
- inspect and manage relations,
- create links,
- delete nodes,
- review delete impact.

The current backend does not yet provide all of these capabilities. The design still targets them explicitly.

## Knowledge Design

`Knowledge` is important, but it is not the primary narrative page. It should be expandable and professional without overshadowing `Chat` and `Workflow`.

### Stable Model

The page distinguishes three layers:

- `Library` — the user-facing searchable scope
- `Connector` — the source of documents or data
- `Engine` — the indexing / retrieval backend such as `PageIndex` or a future RAG adapter

### Chosen Structure

Use the approved split workbench:

- left: `Libraries Explorer`
- center top: search + current scope + actions
- center body tabs / modes:
  - `Search`
  - `Sources`
  - `Jobs`
  - `Engine`
- right: contextual inspector

This keeps the user focused on libraries while still making engine integration explicit and expandable.

### Future Engine Support

The `Engine` mode is where `PageIndex` and future RAG adapters are shown, configured, and compared. It should expose:

- identity,
- capabilities,
- health,
- bindings to libraries.

The engine is visible, but it should not become the top-level organizational model of the page.

## Agents Design

`Agents` becomes an asset library and editing surface:

- list of agents and drafts,
- one-sentence creation entry,
- central editing surface for the selected agent,
- inspector for tool policy, provider context, and future memory / knowledge bindings.

The one-sentence generation flow stays, but no longer dominates the entire page visually.

## Settings Design

`Settings` remains a control panel for:

- Providers
- Appearance
- Runtime

The visual structure should behave like a desktop settings area:

- left secondary section nav,
- central form surface,
- right explanatory inspector.

`Providers` gets the strongest status feedback because it gates real product behavior.

## Error And Empty State Principles

### Errors

Errors must be:

- inline,
- scoped to the triggering action,
- recoverable,
- visually differentiated from normal content.

Avoid generic floating error cards when the error belongs to a specific node, message, or configuration field.

### Empty States

Empty states must guide the next action:

- no provider configured,
- no workflow selected,
- no memory graph yet,
- no knowledge library yet,
- no index jobs yet,
- no search results.

No fake demo data should appear in production empty states.

## Backend Gaps That The Redesign Exposes

The current backend already supports real product state, but this redesign requires new capabilities:

- explicit chat mode handling,
- workflow-room conversation continuation,
- richer workflow session events,
- memory graph read/write/delete operations,
- knowledge engine registry and engine metadata,
- more explicit route metadata for Chat and Workflow handoff.

## Delivery Order

Recommended implementation order:

1. design tokens, shell primitives, brand swap
2. `Chat` redesign with mode switcher and suggestion strip
3. `Workflow` lobby and workflow room
4. `Memory` graph schema, commands, and graph UI
5. `Knowledge` split workbench and engine-aware data model
6. `Agents` and `Settings` refactor into the new shell

## Acceptance Criteria

The redesign is complete when:

- `Chat` clearly functions as the front door of the app,
- `Workflow` has a distinct room-like conversation experience,
- `Memory` is represented as a graph workbench,
- `Knowledge` supports `PageIndex` now and future engines later,
- the product uses the new `nuka.svg` brand mark,
- the card-heavy generic layout has been replaced by page-specific task surfaces,
- the cream and black palette remains intact but looks cleaner, calmer, and more deliberate.
