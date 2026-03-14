# P0 Desktop UI Finalization Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement the approved final P0 desktop UI so the app is visually coherent, keeps `Chat` as the only execution surface, and is ready for the real Tauri MCP acceptance flow.

**Architecture:** Keep all existing runtime and storage semantics grounded in the current desktop application while restructuring the shell, chat surfaces, team-run surfaces, and supporting pages around the approved compact design. Preserve real routing, branching, compaction, memory ownership, recovery, and file-timeline behavior while changing markup, styling, and page composition only where the approved design requires it.

**Tech Stack:** React 19, TypeScript, Vitest, Tauri desktop shell, shared desktop theme CSS, existing runtime commands and desktop page modules

---

## Working Rules

- Follow TDD for every task
- Frequent commits at task granularity
- Do not touch unrelated dirty files:
  - `apps/desktop/package-lock.json`
  - `apps/desktop/src-tauri/Cargo.toml`
  - `apps/desktop/src-tauri/gen/schemas/macOS-schema.json`
- Keep `Chat` as the only execution surface
- Keep `Team` as template management only
- Keep `Agents` as the primary creation surface
- Use Tauri MCP for final real verification

## Task 1: Finalize the shared shell contract

**Files:**
- Modify: `apps/desktop/src/App.tsx`
- Modify: `apps/desktop/src/App.test.tsx`
- Modify: `apps/desktop/src/components/shell/AppShell.tsx`
- Modify: `apps/desktop/src/components/shell/Sidebar.tsx`
- Modify: `apps/desktop/src/styles/theme.css`

**Step 1: Write the failing test**

Add or extend shell-level tests to require:

- session titlebar is not globally persistent
- sidebar uses icon-plus-label navigation
- sidebar provider card only shows provider name, status, and settings action
- toast viewport remains the only shared feedback surface

**Step 2: Run test to verify it fails**

Run:

```bash
npm --prefix apps/desktop test -- src/App.test.tsx -- --runInBand
```

Expected: FAIL because the old shell contract does not yet match the approved design.

**Step 3: Write minimal implementation**

Update `AppShell.tsx`, `Sidebar.tsx`, and shared shell styles to match the approved shell contract without changing page routing semantics.

**Step 4: Run test to verify it passes**

Run the same command.

Expected: PASS

**Step 5: Commit**

```bash
git -C /Users/nidhogg/Desktop/Nuka/.worktrees/p0-desktop-control-plane add \
  apps/desktop/src/App.tsx \
  apps/desktop/src/App.test.tsx \
  apps/desktop/src/components/shell/AppShell.tsx \
  apps/desktop/src/components/shell/Sidebar.tsx \
  apps/desktop/src/styles/theme.css
git -C /Users/nidhogg/Desktop/Nuka/.worktrees/p0-desktop-control-plane commit -m "feat: finalize shared desktop shell"
```

## Task 2: Rebuild the chat skeleton, session rail, and session titlebar

**Files:**
- Modify: `apps/desktop/src/features/chat/SessionTabs.tsx`
- Modify: `apps/desktop/src/features/chat/ChatPage.tsx`
- Modify: `apps/desktop/src/features/chat/ChatPage.test.tsx`
- Modify: `apps/desktop/src/styles/theme.css`

**Step 1: Write the failing test**

Add or update chat tests to require:

- browser-style single-row session rail
- hover/focus close affordance inside each tab
- separate lightweight session titlebar
- titlebar hidden on landing and visible only for active direct chat or active team run
- titlebar text truncated with ellipsis instead of showing long session ids

**Step 2: Run test to verify it fails**

Run:

```bash
npm --prefix apps/desktop test -- src/features/chat/ChatPage.test.tsx -- --runInBand
```

Expected: FAIL because the current chat skeleton still uses the old markup and copy.

**Step 3: Write minimal implementation**

Update the chat skeleton and session-rail markup while preserving session switching, branching, and recovery data flow.

**Step 4: Run test to verify it passes**

Run the same command.

Expected: PASS

**Step 5: Commit**

```bash
git -C /Users/nidhogg/Desktop/Nuka/.worktrees/p0-desktop-control-plane add \
  apps/desktop/src/features/chat/SessionTabs.tsx \
  apps/desktop/src/features/chat/ChatPage.tsx \
  apps/desktop/src/features/chat/ChatPage.test.tsx \
  apps/desktop/src/styles/theme.css
git -C /Users/nidhogg/Desktop/Nuka/.worktrees/p0-desktop-control-plane commit -m "feat: rebuild chat shell chrome"
```

## Task 3: Rebuild the unified composer

**Files:**
- Modify: `apps/desktop/src/features/chat/ChatPage.tsx`
- Modify: `apps/desktop/src/features/chat/ChatPage.test.tsx`
- Modify: `apps/desktop/src/styles/theme.css`

**Step 1: Write the failing test**

Require:

- one unified rounded composer
- embedded control row
- left utility controls for `+`, note, and route
- route chip showing `provider + model` in small text
- circular send button on the right
- no external composer footer strip

**Step 2: Run test to verify it fails**

Run:

```bash
npm --prefix apps/desktop test -- src/features/chat/ChatPage.test.tsx -- --runInBand
```

Expected: FAIL because the current composer markup does not yet match the approved structure.

**Step 3: Write minimal implementation**

Update the composer markup and styles while preserving direct chat, team entry, route, and external-editor behavior.

**Step 4: Run test to verify it passes**

Run the same command.

Expected: PASS

**Step 5: Commit**

```bash
git -C /Users/nidhogg/Desktop/Nuka/.worktrees/p0-desktop-control-plane add \
  apps/desktop/src/features/chat/ChatPage.tsx \
  apps/desktop/src/features/chat/ChatPage.test.tsx \
  apps/desktop/src/styles/theme.css
git -C /Users/nidhogg/Desktop/Nuka/.worktrees/p0-desktop-control-plane commit -m "feat: unify the chat composer"
```

## Task 4: Rebuild the direct-chat transcript and compaction affordances

**Files:**
- Modify: `apps/desktop/src/features/chat/ConversationEventBlock.tsx`
- Modify: `apps/desktop/src/features/chat/ChatPage.tsx`
- Modify: `apps/desktop/src/features/chat/ChatPage.test.tsx`
- Modify: `apps/desktop/src/styles/theme.css`

**Step 1: Write the failing test**

Require:

- distinct rendering for `user`, `assistant`, `thinking`, and `system/tool` turns
- markdown-friendly assistant rendering
- branch anchor icon on hover/focus instead of a loud action button
- lightweight compaction notice with expandable summary

**Step 2: Run test to verify it fails**

Run:

```bash
npm --prefix apps/desktop test -- src/features/chat/ChatPage.test.tsx -- --runInBand
```

Expected: FAIL because the current transcript does not yet match the approved turn hierarchy.

**Step 3: Write minimal implementation**

Adjust transcript components and styles while keeping real history, branching, and compaction semantics intact.

**Step 4: Run test to verify it passes**

Run the same command.

Expected: PASS

**Step 5: Commit**

```bash
git -C /Users/nidhogg/Desktop/Nuka/.worktrees/p0-desktop-control-plane add \
  apps/desktop/src/features/chat/ConversationEventBlock.tsx \
  apps/desktop/src/features/chat/ChatPage.tsx \
  apps/desktop/src/features/chat/ChatPage.test.tsx \
  apps/desktop/src/styles/theme.css
git -C /Users/nidhogg/Desktop/Nuka/.worktrees/p0-desktop-control-plane commit -m "feat: refine direct chat transcript states"
```

## Task 5: Convert team runs into a conversation-first workspace inside Chat

**Files:**
- Modify: `apps/desktop/src/features/chat/TeamRunPanel.tsx`
- Modify: `apps/desktop/src/features/chat/RunEventFeed.tsx`
- Modify: `apps/desktop/src/features/chat/AgentTeamStrip.tsx`
- Modify: `apps/desktop/src/features/chat/RunCharterCard.tsx`
- Modify: `apps/desktop/src/features/chat/ChatPage.tsx`
- Modify: `apps/desktop/src/features/chat/TeamRunPanel.test.tsx`
- Modify: `apps/desktop/src/features/chat/ChatPage.test.tsx`
- Modify: `apps/desktop/src/styles/theme.css`

**Step 1: Write the failing tests**

Require:

- team-run internal view tabs for `Conversation`, `Status`, `Agents`, and `Files`
- conversation-first feed
- avatar dot + name + role identity row
- readable markdown and thinking disclosures
- normalized run-state labels
- compact queue/recovery/timeline sections

**Step 2: Run test to verify it fails**

Run:

```bash
npm --prefix apps/desktop test -- src/features/chat/TeamRunPanel.test.tsx src/features/chat/ChatPage.test.tsx -- --runInBand
```

Expected: FAIL because the current team-run UI is still oversized and not split into the approved views.

**Step 3: Write minimal implementation**

Update the team-run surface to the approved conversation-first layout without changing real runtime behavior.

**Step 4: Run test to verify it passes**

Run the same command.

Expected: PASS

**Step 5: Commit**

```bash
git -C /Users/nidhogg/Desktop/Nuka/.worktrees/p0-desktop-control-plane add \
  apps/desktop/src/features/chat/TeamRunPanel.tsx \
  apps/desktop/src/features/chat/RunEventFeed.tsx \
  apps/desktop/src/features/chat/AgentTeamStrip.tsx \
  apps/desktop/src/features/chat/RunCharterCard.tsx \
  apps/desktop/src/features/chat/ChatPage.tsx \
  apps/desktop/src/features/chat/TeamRunPanel.test.tsx \
  apps/desktop/src/features/chat/ChatPage.test.tsx \
  apps/desktop/src/styles/theme.css
git -C /Users/nidhogg/Desktop/Nuka/.worktrees/p0-desktop-control-plane commit -m "feat: rebuild team runs inside chat"
```

## Task 6: Rebuild the Team template-management page

**Files:**
- Modify: `apps/desktop/src/features/team/TeamPage.tsx`
- Modify: `apps/desktop/src/features/team/TeamEditor.tsx`
- Modify: `apps/desktop/src/features/team/TeamList.tsx`
- Modify: `apps/desktop/src/features/team/TeamAgentCard.tsx`
- Modify: `apps/desktop/src/features/team/TeamToolBindingsPanel.tsx`
- Modify: `apps/desktop/src/features/team/TeamPage.test.tsx`
- Modify: `apps/desktop/src/styles/theme.css`

**Step 1: Write the failing test**

Require:

- left template list rail
- right field-based editor
- no JSON-first editing surface
- recent launches summarized with `Open in Chat`

**Step 2: Run test to verify it fails**

Run:

```bash
npm --prefix apps/desktop test -- src/features/team/TeamPage.test.tsx -- --runInBand
```

Expected: FAIL because the current team page still exposes overly raw editing patterns.

**Step 3: Write minimal implementation**

Rebuild the team page to match the approved editor structure without changing backend team semantics.

**Step 4: Run test to verify it passes**

Run the same command.

Expected: PASS

**Step 5: Commit**

```bash
git -C /Users/nidhogg/Desktop/Nuka/.worktrees/p0-desktop-control-plane add \
  apps/desktop/src/features/team/TeamPage.tsx \
  apps/desktop/src/features/team/TeamEditor.tsx \
  apps/desktop/src/features/team/TeamList.tsx \
  apps/desktop/src/features/team/TeamAgentCard.tsx \
  apps/desktop/src/features/team/TeamToolBindingsPanel.tsx \
  apps/desktop/src/features/team/TeamPage.test.tsx \
  apps/desktop/src/styles/theme.css
git -C /Users/nidhogg/Desktop/Nuka/.worktrees/p0-desktop-control-plane commit -m "feat: rebuild the team template editor"
```

## Task 7: Rebuild the Agents creation surface

**Files:**
- Modify: `apps/desktop/src/features/agents/AgentsPage.tsx`
- Modify: `apps/desktop/src/features/agents/ToolBindingsPanel.tsx`
- Modify: `apps/desktop/src/features/agents/AgentsPage.test.tsx`
- Modify: `apps/desktop/src/styles/theme.css`

**Step 1: Write the failing test**

Require:

- left agent list rail
- right editor with grouped archetype cards
- create/draft section as the primary entry surface
- tools section aligned with the new page shell

**Step 2: Run test to verify it fails**

Run:

```bash
npm --prefix apps/desktop test -- src/features/agents/AgentsPage.test.tsx -- --runInBand
```

Expected: FAIL because the current page does not yet use the approved grouped-editor layout.

**Step 3: Write minimal implementation**

Rebuild the agent page without changing real agent creation and persistence behavior.

**Step 4: Run test to verify it passes**

Run the same command.

Expected: PASS

**Step 5: Commit**

```bash
git -C /Users/nidhogg/Desktop/Nuka/.worktrees/p0-desktop-control-plane add \
  apps/desktop/src/features/agents/AgentsPage.tsx \
  apps/desktop/src/features/agents/ToolBindingsPanel.tsx \
  apps/desktop/src/features/agents/AgentsPage.test.tsx \
  apps/desktop/src/styles/theme.css
git -C /Users/nidhogg/Desktop/Nuka/.worktrees/p0-desktop-control-plane commit -m "feat: rebuild the agents creation surface"
```

## Task 8: Rebuild the owner-based Memory page

**Files:**
- Modify: `apps/desktop/src/features/memory/MemoryPage.tsx`
- Modify: `apps/desktop/src/features/memory/MemoryGraphCanvas.tsx`
- Modify: `apps/desktop/src/features/memory/MemoryGraphControls.tsx`
- Modify: `apps/desktop/src/features/memory/MemoryNodeInspector.tsx`
- Modify: `apps/desktop/src/features/memory/MemoryPage.test.tsx`
- Modify: `apps/desktop/src/styles/theme.css`

**Step 1: Write the failing test**

Require:

- owner rail with `Direct chat` and `Teams`
- no session-based memory ownership UI
- one shared direct-chat memory
- one shared memory per team
- independent graph per owner
- relationship-graph presentation
- source-aware search behavior

**Step 2: Run test to verify it fails**

Run:

```bash
npm --prefix apps/desktop test -- src/features/memory/MemoryPage.test.tsx -- --runInBand
```

Expected: FAIL because the current memory page still uses the old scope model and visual organization.

**Step 3: Write minimal implementation**

Rebuild the memory page around owner-based graphs while keeping real memory operations intact.

**Step 4: Run test to verify it passes**

Run the same command.

Expected: PASS

**Step 5: Commit**

```bash
git -C /Users/nidhogg/Desktop/Nuka/.worktrees/p0-desktop-control-plane add \
  apps/desktop/src/features/memory/MemoryPage.tsx \
  apps/desktop/src/features/memory/MemoryGraphCanvas.tsx \
  apps/desktop/src/features/memory/MemoryGraphControls.tsx \
  apps/desktop/src/features/memory/MemoryNodeInspector.tsx \
  apps/desktop/src/features/memory/MemoryPage.test.tsx \
  apps/desktop/src/styles/theme.css
git -C /Users/nidhogg/Desktop/Nuka/.worktrees/p0-desktop-control-plane commit -m "feat: rebuild owner-based memory graphs"
```

## Task 9: Rebuild Settings around Providers, Runtime, and Appearance

**Files:**
- Modify: `apps/desktop/src/features/settings/SettingsPage.tsx`
- Modify: `apps/desktop/src/features/settings/SettingsPage.test.tsx`
- Modify: `apps/desktop/src/components/ui/FlatSelect.tsx`
- Modify: `apps/desktop/src/styles/theme.css`

**Step 1: Write the failing test**

Require:

- section rail with `Providers`, `Runtime`, and `Appearance`
- flat select parity across sections
- provider section as the primary surface
- appearance controls for language, locale, fonts, density, motion, chrome, and sidebar behavior
- toast-only save feedback

**Step 2: Run test to verify it fails**

Run:

```bash
npm --prefix apps/desktop test -- src/features/settings/SettingsPage.test.tsx -- --runInBand
```

Expected: FAIL because the current settings page still reflects the older section model.

**Step 3: Write minimal implementation**

Update settings composition and control styling while preserving current settings persistence and provider behavior.

**Step 4: Run test to verify it passes**

Run the same command.

Expected: PASS

**Step 5: Commit**

```bash
git -C /Users/nidhogg/Desktop/Nuka/.worktrees/p0-desktop-control-plane add \
  apps/desktop/src/features/settings/SettingsPage.tsx \
  apps/desktop/src/features/settings/SettingsPage.test.tsx \
  apps/desktop/src/components/ui/FlatSelect.tsx \
  apps/desktop/src/styles/theme.css
git -C /Users/nidhogg/Desktop/Nuka/.worktrees/p0-desktop-control-plane commit -m "feat: rebuild settings sections and appearance"
```

## Task 10: Run the UI readiness gate before final P0 acceptance

**Files:**
- Verify only: `apps/desktop/src/App.tsx`
- Verify only: `apps/desktop/src/components/shell/AppShell.tsx`
- Verify only: `apps/desktop/src/components/shell/Sidebar.tsx`
- Verify only: `apps/desktop/src/features/chat/ChatPage.tsx`
- Verify only: `apps/desktop/src/features/chat/TeamRunPanel.tsx`
- Verify only: `apps/desktop/src/features/team/TeamPage.tsx`
- Verify only: `apps/desktop/src/features/agents/AgentsPage.tsx`
- Verify only: `apps/desktop/src/features/memory/MemoryPage.tsx`
- Verify only: `apps/desktop/src/features/settings/SettingsPage.tsx`

**Step 1: Run focused automated coverage**

Run:

```bash
npm --prefix apps/desktop test -- src/App.test.tsx src/features/chat/ChatPage.test.tsx src/features/chat/TeamRunPanel.test.tsx src/features/team/TeamPage.test.tsx src/features/agents/AgentsPage.test.tsx src/features/memory/MemoryPage.test.tsx src/features/settings/SettingsPage.test.tsx -- --runInBand
```

Expected: PASS

**Step 2: Run desktop build**

Run:

```bash
npm --prefix apps/desktop run build
```

Expected: PASS

**Step 3: Run real desktop UI review**

Using one real desktop app instance plus Tauri MCP, review:

- shell chrome
- browser-style session rail
- session titlebar
- unified composer
- direct-chat transcript states
- team-run internal views
- team template editor
- agents creation surface
- owner-based memory graphs
- providers/runtime/appearance settings

**Step 4: Run the P0 Tauri MCP acceptance flow**

After the UI readiness gate passes, resume the paused P0 acceptance sequence from the P0 docs:

- preflight
- automated verification refresh
- single-instance Tauri MCP flow
- restart recovery
- SQLite/plaintext audit
- cleanup review

**Step 5: Commit**

```bash
git -C /Users/nidhogg/Desktop/Nuka/.worktrees/p0-desktop-control-plane add \
  docs/plans/2026-03-15-p0-desktop-ui-final-design.md \
  docs/plans/2026-03-15-p0-desktop-ui-finalization.md
git -C /Users/nidhogg/Desktop/Nuka/.worktrees/p0-desktop-control-plane commit -m "docs: finalize p0 desktop ui design and plan"
```
