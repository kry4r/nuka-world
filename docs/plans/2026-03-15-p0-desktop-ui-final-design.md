# P0 Desktop UI Final Design

Date: 2026-03-15

Supersedes:
- `docs/plans/2026-03-14-p0-claude-compact-ui-design.md`

## Goal

Finalize the desktop UI direction that must be implemented before the final P0 acceptance run. The result must keep `Chat` as the only execution surface, keep `Team` as template management, keep `Agents` as the primary creation surface, and remove the remaining visually inconsistent or structurally misleading desktop UI.

## Product Boundaries

- P0 only
- Desktop remains the only control plane
- `Chat` remains the only execution surface
- `Team` manages team templates only
- `Agents` remains the primary agent creation surface
- no mock runtime, fake state, fake provider path, or fake UI flow
- no new P1 or P2 features

## Global Visual Direction

The desktop should use a compact, soft, Claude-like desktop rhythm:

- calm surfaces
- compact spacing
- low-noise helper copy
- direct actions
- readable markdown
- flat, consistent controls

The app should not look like separate experiments stitched together. Every page must share:

- the same spacing rhythm
- the same border and radius language
- the same flat select/input styling
- the same toast feedback model

## App Shell

### Purpose

The app shell should frame the product without competing with the current page content.

### Structure

- left `Sidebar`
- right `Workspace`
- toast viewport in the upper-right corner

### Titlebar

The titlebar should not be a global persistent header.

- only show it when an active chat session or active team-run session is open
- hide it on the `Chat` landing state
- hide it on `Team`, `Agents`, `Memory`, and `Settings`
- use it as a lightweight session strip, not as a heavy page header

The session titlebar should show:

- whether the current session is `Chat` or `Team run`
- the session title

The session title should:

- stay on one line
- truncate with ellipsis when long
- never show a long session id in place of the real title

### Sidebar

The sidebar remains visible globally.

It should contain:

- brand lockup
- primary navigation with higher-fidelity icons and labels
- compact provider card
- settings entry

The sidebar provider card should show only:

- provider name
- status dot
- `Open Settings` button

Do not show long provider helper copy in the sidebar.

## Shared Feedback Model

All success, warning, and error feedback should use toast cards only.

- no inline page-level error slabs unless a page is fully blocked
- toasts appear in the upper-right corner
- toasts are light cards with short copy and a dismiss affordance

## Chat Page

## Landing State

The landing state should show only:

- hero lockup
- large unified composer

Do not show:

- session rail
- session titlebar
- route metadata cards
- duplicated explanatory copy

## Active Session Structure

An active direct-chat session or active team-run session uses the same skeleton:

1. browser-style session rail
2. lightweight session titlebar
3. main content surface
4. bottom composer

Tabs and titlebar are separate layers. They must not visually collide or merge into a stacked mess.

### Session Rail

The session rail should feel browser-like while staying soft enough to match the desktop shell.

Rules:

- one row only
- horizontal scrolling for overflow
- tab titles truncate with ellipsis
- close affordance appears inside the tab on hover or keyboard focus
- close affordance never appears below the tab
- tab content never uses two stacked text rows
- branch state is a lightweight internal marker, not a second subtitle line
- active tab remains visually stronger than inactive tabs

### Session Titlebar

The session titlebar exists only when a session is active.

Rules:

- show `Chat` or `Team run`
- show the full conversation or run title semantically, but render it as one truncated line
- no session id line
- no route/provider/model card here
- no duplicated `Direct chat` wording

## Direct Chat Surface

### Feed Direction

Direct chat should read like a transcript, not like a dashboard and not like a generic messaging app.

### Turn Types

The feed must support these distinct turn types:

- `user`
- `assistant`
- `thinking`
- `system`
- `tool`

### User Turn

- compact right-aligned bubble
- stronger fill than assistant turns
- content-first
- no loud `You` chrome

### Assistant Turn

- left-aligned
- flatter than user turns
- markdown-first
- designed for reading, not badge collection

### Thinking Turn

Thinking must be visually distinct from the final answer.

Rules:

- lighter than assistant turns
- collapsed by default
- compact `Thinking` strip plus a short summary or status
- expandable to show markdown reasoning
- never fake; render only when real thinking data exists

### System and Tool Turns

- rendered as compact state/event cards
- clearly distinct from assistant replies
- used only for real system/tool events

### Branching

Branching must remain available from real history anchors without making every turn look like an action toolbar.

Rules:

- branch affordance is a small anchor icon
- hidden by default
- shown on hover or keyboard focus
- tooltip copy may explain `Branch from here`
- no full-width `Branch` button in every turn

### Compaction Notice

Automatic compaction must surface in the direct chat feed as a lightweight system notice.

Rules:

- compact notice such as `Earlier turns compacted`
- expandable to show the compaction summary
- belongs to the current direct-chat memory owner

## Composer

### Core Shape

The composer is a single rounded rectangle.

- input area on top
- control row embedded at the bottom
- no external footer strip
- no divider-heavy layout

### Landing Composer

- larger
- centered
- primary visual focus

### Active Composer

- same structure as landing
- shorter and denser
- still leaves enough visible input height

### Embedded Control Row

Left side:

- `+`
- note icon
- route chip

Right side:

- circular send button with arrow icon

All controls must stay inside the composer and remain aligned on one row.

### Route Chip

The route chip must:

- match the height of the other utility controls
- use small text
- show `provider + model`
- truncate when long
- open the route/provider/model popover when pressed

Route and provider configuration stay owned by `Settings`. The composer route chip is only a per-chat/session override surface.

## Team Run Inside Chat

## Core Principle

`Team run` remains inside `Chat`. It does not get its own separate execution page.

The team-run surface should feel like a group conversation with lightweight observability, not like a dashboard.

## Team-Run Internal Views

Inside an active team-run session, use lightweight secondary view tabs:

- `Conversation`
- `Status`
- `Agents`
- `Files`

These view tabs belong to the active team-run content area only. They are not global app navigation and not the top session rail.

### Conversation View

This is the default.

The conversation view shows:

- agent discussion
- markdown-rich responses
- thinking disclosures
- system state events
- compact run notices

Agent identity should use:

- avatar dot
- agent name
- role

### Status View

This view shows:

- current round
- run status
- queued / blocked / stuck / resumed state
- checkpoint summary
- next-step status

State labels must be normalized into readable UI text. Raw values like `waiting_for_user` should never appear naked in the UI.

### Agents View

This view shows what each agent is doing now.

Fields:

- avatar dot
- name
- role
- current work
- last activity
- tool state
- thinking / waiting / reviewing state

### Files View

This view shows the file timeline.

Rules:

- round and batch grouping remain visible
- real file changes remain visible
- layout remains compact and secondary

### Recovery and Queue

Queue, blocked, stuck, retry, and resume states remain real runtime-backed features, but they should render as lightweight contextual cards inside the team-run surface rather than as oversized control panels.

## Team Page

`Team` is a template-management page only.

### Layout

- left team list rail
- right team editor workspace

### Team List

Each item shows:

- team name
- goal summary
- agent count
- updated time

### Team Editor

Use field editing, not JSON editing.

Sections:

- `Overview`
- `Agents`
- `Tools & Permissions`
- `Recent launches`

`Recent launches` is only a summary and jump surface. It links back to `Chat`.

## Agents Page

`Agents` remains the primary creation surface.

### Layout

- left agent list rail
- right agent editor

### Editor Sections

- `Create / Draft`
- `Identity`
- `Archetype`
- `Tools`

Archetype editing uses grouped cards rather than one unbroken long form.

## Memory Page

## Memory Ownership Model

Memory is not session-scoped.

### Direct Chat

All direct-chat conversations share one direct-chat memory.

- `/new` starts a new direct-chat session view
- it does not create a new direct memory owner

### Team

Each team owns one shared memory.

- all team chats for the same team share that memory
- `/new` in team chat opens a new team-chat conversation view
- it does not create a new team memory owner

### Owner Parity

`Direct chat` and each `Team` are first-class memory owners at the same level.

## Memory Page Layout

- left owner rail
- center graph workbench
- right node inspector

### Owner Rail

The owner rail should contain:

- search
- `Direct chat`
- `Teams`
  - each team listed underneath

This is not a session list.

### Graph Workbench

Each owner opens its own independent relationship graph.

Rules:

- no single global graph
- no session-based graph split
- relation graph style should follow an explorable node-link layout
- inspiration may come from MiroFish-style relation graphs, but Nuka remains cleaner and denser

### Inspector

The inspector remains field-edit based.

No JSON-first node editing.

### Search

Support search across:

- `Direct chat`
- `Teams`

Results must preserve source clarity.

## Settings Page

Sections:

- `Providers`
- `Runtime`
- `Appearance`

### Providers

This remains the primary settings section.

Include:

- provider list
- provider editing
- default provider
- fallback provider
- connection checks

### Runtime

Include:

- external editor path
- close behavior
- tray and background behavior
- logging
- notifications

### Appearance

Include:

- language
- response locale
- interface font
- message font
- text size
- density
- motion
- window chrome
- sidebar default

All selects and inputs must use the same flat visual language.

## Out of Scope

- redesigning runtime semantics beyond what is already in P0
- adding new providers or fake adapters
- moving execution away from `Chat`
- turning `Team` into a second execution surface
- changing the provider-storage encryption direction already landed

## Verification Gate

Do not resume final P0 acceptance until all of the following are true:

- shared shell is visually unified
- browser-style session rail works and looks correct
- session titlebar is lightweight and non-duplicative
- direct chat feed supports the new turn hierarchy
- team run behaves as a conversation-first execution surface inside `Chat`
- `Team`, `Agents`, `Memory`, and `Settings` all match the same control and spacing system
- compaction notice is visible in chat
- memory ownership matches the owner model above
