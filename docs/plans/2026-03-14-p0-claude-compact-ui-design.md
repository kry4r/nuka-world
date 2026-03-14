# P0 Claude-Style Compact UI Design

Date: 2026-03-14

## Goal

Bring the desktop shell to a compact Claude-like interaction model before P0 acceptance. The app should feel calm, dense, and deliberate while keeping `Chat` as the only execution surface and preserving the current P0 runtime model.

## References

- Claude MCP app design guidelines: calm surfaces, conversational hierarchy, minimal helper copy, direct actions
- Material desktop tab guidance: single-row tab rail, overflow handling, compressed titles, strong active-state continuity
- Vercel AI Elements patterns: chat-first structure, secondary operational metadata, light affordances around the composer

## Hard Constraints

- P0 only; no P1 or P2 capability work
- Desktop remains the only control plane
- `Chat` remains the only execution surface
- `Team` remains a template-management page
- `Agents` remains the primary creation surface
- no mock runtime, fake route, fake timeline, or fake recovery UI
- visual changes must stay backed by the current desktop runtime and current page structure

## Approved Direction

The desktop UI should move toward a Claude-style soft-card layout, but tighter than the current implementation:

- softer cards, lighter borders, calmer active states
- denser spacing and less repeated copy
- execution metadata demoted below primary conversation content
- tabs, header, composer, and team-run surfaces aligned to a single visual rhythm

## Visual System

### Density

- reduce redundant labels, stacked subtitles, and repeated type badges
- prefer one compact header row plus one lightweight meta row instead of multiple stacked strips
- keep a consistent vertical rhythm across `Chat`, `Team`, `Agents`, `Memory`, and `Settings`

### Card Hierarchy

Only three surface levels should remain:

1. page shell container
2. functional cards such as tabs, queue rail, recovery rail, or settings groups
3. message or event cards inside the feed

Anything else should collapse into typography or inline badges.

### Copy Rules

- remove `World` wording from active chat surfaces
- avoid repeating `Direct chat` or run type in both tabs and headers
- keep state words as short badges instead of large standalone labels

## Chat Surface

### Session Rail

The current uniform attached tabs should become a real session rail:

- single row only
- horizontal scroll for overflow
- title compression with ellipsis
- close affordance on hover and on active tabs
- branch represented as a small badge rather than a second title layer
- active tab should visually connect to the active content panel without a heavy top shelf

### Session Header

The current `Direct chat / Session ... / Direct chat` strip should no longer sit glued under the tabs. Replace it with an in-panel session header that:

- sits inside the conversation card
- keeps one primary title
- keeps one compact meta line
- removes duplicated session-type wording

### Composer

The composer should keep the current behavior but change layout:

- use one rounded rectangle composer card
- keep `+`, note, and route in the left utility cluster
- keep circular send on the right
- remove footer dividers and broken vertical alignment
- keep the input area visually larger than the control row
- show route and effective model in a low-weight inline control, not as a large card

## Team Run Surface

### Layout

`Team run` should read like a group conversation rather than a dashboard:

- queue and recovery become a thin rail at the top
- agent strip becomes compact and secondary
- conversation feed becomes the dominant surface
- markdown output stays readable inside event cards
- run details and file timeline move into lighter secondary sections

### Event Hierarchy

- checkpoint summaries, blocked notices, resumed notices, and agent updates all live in the same chronological feed
- large raw state labels such as `waiting_for_user` and `analysis` should be normalized into compact badges and concise captions
- tables or markdown blocks should render within the feed without turning the page into a report layout

### Density Rules

- no oversized equal-weight cards
- avoid left/right asymmetry that leaves large dead zones
- keep action controls close to the follow-up input

## Cross-Page Consistency Sweep

Before P0 acceptance starts, perform a visual sweep on:

- `Chat`
- `Team`
- `Agents`
- `Memory`
- `Settings`

The sweep should verify:

- compact spacing at default zoom
- no clipped controls or cut-off panels
- flat select/input styling parity
- consistent card paddings and border radii
- scroll behavior works where content exceeds the viewport

## P0 Acceptance Prerequisite

This UI pass is now a gate before the final P0 Tauri MCP acceptance flow.

Do not resume the final P0 acceptance run until all of the following are true:

- chat header no longer collides visually with the session rail
- session rail supports overflow and close affordances
- composer alignment is corrected
- team run is compact and conversation-first
- the page sweep across `Team`, `Agents`, `Memory`, and `Settings` is complete
