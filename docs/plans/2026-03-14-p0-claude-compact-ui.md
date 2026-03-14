# P0 Claude-Style Compact UI Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rebuild the desktop shell into a compact Claude-style interface before the final P0 acceptance flow, without changing P0 runtime scope or adding new product capability.

**Architecture:** Keep the existing runtime commands, workspace session model, branching model, recovery actions, and team-run data intact. Restrict this work to desktop composition, copy cleanup, and style-system alignment so the result is still backed by the current Tauri and runtime paths.

**Tech Stack:** React 19, TypeScript, Vitest, Tauri desktop shell, shared desktop theme CSS

---

## Parallelization Boundary

Because the current desktop UI still converges in `apps/desktop/src/styles/theme.css`, shared styling must stay under coordinator control.

- **Track A:** `SessionTabs.tsx`, session header markup, `ChatPage.test.tsx`
- **Track B:** `TeamRunPanel.tsx`, `RunEventFeed.tsx`, `AgentTeamStrip.tsx`, `RunCharterCard.tsx`, team-run tests
- **Track C:** `TeamPage.tsx`, `AgentsPage.tsx`, `MemoryPage.tsx`, `SettingsPage.tsx`, page-level consistency tests
- **Coordinator only:** `ChatPage.tsx`, `apps/desktop/src/styles/theme.css`, final merge, cleanup, screenshots, and P0 acceptance

No two tracks edit the same file. `theme.css` stays with the coordinator until markup changes are merged.

### Task 1: Lock the UI readiness gate into P0 verification docs

**Files:**
- Modify: `docs/plans/2026-03-12-nuka-desktop-team-assistant/p0/implementation.md`
- Modify: `docs/plans/2026-03-12-nuka-desktop-team-assistant/p0/acceptance-checklist.md`

**Step 1: Patch the implementation doc**

Add the compact UI readiness requirement to Track B and to the P0 verification prerequisites.

**Step 2: Patch the acceptance checklist**

Add a `UI Readiness Gate` that must pass before any final Tauri MCP acceptance run begins.

**Step 3: Verify the docs render cleanly**

Run: `git -C /Users/nidhogg/Desktop/Nuka/.worktrees/p0-desktop-control-plane diff --check`
Expected: no whitespace or patch-format errors

**Step 4: Commit**

```bash
git -C /Users/nidhogg/Desktop/Nuka/.worktrees/p0-desktop-control-plane add \
  docs/plans/2026-03-12-nuka-desktop-team-assistant/p0/implementation.md \
  docs/plans/2026-03-12-nuka-desktop-team-assistant/p0/acceptance-checklist.md \
  docs/plans/2026-03-14-p0-claude-compact-ui-design.md \
  docs/plans/2026-03-14-p0-claude-compact-ui.md
git -C /Users/nidhogg/Desktop/Nuka/.worktrees/p0-desktop-control-plane commit -m "docs: gate p0 acceptance on compact ui readiness"
```

### Task 2: Rebuild the session rail and in-panel chat header

**Files:**
- Modify: `apps/desktop/src/features/chat/SessionTabs.tsx`
- Modify: `apps/desktop/src/features/chat/ChatPage.tsx`
- Test: `apps/desktop/src/features/chat/ChatPage.test.tsx`

**Step 1: Write the failing test**

Add a targeted test that requires:

- a horizontally scrollable session rail hook
- compressed tab titles instead of uniform fixed-width tabs
- branch as a compact badge
- close affordance markup for tabs
- in-panel session header markup that does not duplicate `Direct chat`
- no `World conversation surface` or `Reply to World...` copy on active chat surfaces

**Step 2: Run test to verify it fails**

Run: `npm --prefix apps/desktop test -- src/features/chat/ChatPage.test.tsx -- --runInBand -t "renders a compact session rail and chat header"`
Expected: FAIL because the old uniform tabs and old header/copy still render

**Step 3: Write minimal implementation**

Update `SessionTabs.tsx` and `ChatPage.tsx` so the DOM structure exposes the new rail and header semantics while preserving current branch selection and tab switching behavior.

**Step 4: Run test to verify it passes**

Run the same targeted test.
Expected: PASS

**Step 5: Commit**

```bash
git add apps/desktop/src/features/chat/SessionTabs.tsx apps/desktop/src/features/chat/ChatPage.tsx apps/desktop/src/features/chat/ChatPage.test.tsx
git commit -m "feat: compact chat session rail and header"
```

### Task 3: Rebuild the composer into a compact Claude-style control row

**Files:**
- Modify: `apps/desktop/src/features/chat/ChatPage.tsx`
- Test: `apps/desktop/src/features/chat/ChatPage.test.tsx`

**Step 1: Write the failing test**

Add a targeted test that requires:

- `+`, note, and route controls grouped on the left
- circular send button on the right
- route and model shown as a low-weight inline token
- no broken footer divider wrapper
- no `World` wording in placeholders or button labels

**Step 2: Run test to verify it fails**

Run: `npm --prefix apps/desktop test -- src/features/chat/ChatPage.test.tsx -- --runInBand -t "renders the compact claude-style composer"`
Expected: FAIL because the old footer and wording still exist

**Step 3: Write minimal implementation**

Adjust the composer markup only; keep direct chat, team entry, route selection, and external-draft behavior unchanged.

**Step 4: Run test to verify it passes**

Run the same targeted test.
Expected: PASS

**Step 5: Commit**

```bash
git add apps/desktop/src/features/chat/ChatPage.tsx apps/desktop/src/features/chat/ChatPage.test.tsx
git commit -m "feat: compact chat composer layout"
```

### Task 4: Convert team runs into a compact conversation-first surface

**Files:**
- Modify: `apps/desktop/src/features/chat/TeamRunPanel.tsx`
- Modify: `apps/desktop/src/features/chat/RunEventFeed.tsx`
- Modify: `apps/desktop/src/features/chat/AgentTeamStrip.tsx`
- Modify: `apps/desktop/src/features/chat/RunCharterCard.tsx`
- Modify: `apps/desktop/src/features/chat/ChatPage.tsx`
- Test: `apps/desktop/src/features/chat/TeamRunPanel.test.tsx`
- Test: `apps/desktop/src/features/chat/ChatPage.test.tsx`

**Step 1: Write the failing tests**

Add tests that require:

- queue/recovery rendered as a thin top rail
- compact agent strip instead of oversized equal-weight cards
- conversation feed remaining the dominant section
- file timeline rendered as a secondary section
- normalized state badges instead of raw large labels

**Step 2: Run tests to verify they fail**

Run: `npm --prefix apps/desktop test -- src/features/chat/TeamRunPanel.test.tsx src/features/chat/ChatPage.test.tsx -- --runInBand -t "renders team runs as a compact conversation workspace"`
Expected: FAIL because the current panel remains too large and dashboard-like

**Step 3: Write minimal implementation**

Rebuild the team-run structure around the feed while preserving branching, retry, resume, add-agent, and continue actions.

**Step 4: Run tests to verify they pass**

Run the same targeted tests.
Expected: PASS

**Step 5: Commit**

```bash
git add apps/desktop/src/features/chat/TeamRunPanel.tsx apps/desktop/src/features/chat/RunEventFeed.tsx apps/desktop/src/features/chat/AgentTeamStrip.tsx apps/desktop/src/features/chat/RunCharterCard.tsx apps/desktop/src/features/chat/ChatPage.tsx apps/desktop/src/features/chat/TeamRunPanel.test.tsx apps/desktop/src/features/chat/ChatPage.test.tsx
git commit -m "feat: compact the team run workspace"
```

### Task 5: Run a page-consistency sweep on Team, Agents, Memory, and Settings

**Files:**
- Modify: `apps/desktop/src/features/team/TeamPage.tsx`
- Modify: `apps/desktop/src/features/agents/AgentsPage.tsx`
- Modify: `apps/desktop/src/features/memory/MemoryPage.tsx`
- Modify: `apps/desktop/src/features/settings/SettingsPage.tsx`
- Test: `apps/desktop/src/features/team/TeamPage.test.tsx`
- Test: `apps/desktop/src/features/agents/AgentsPage.test.tsx`
- Test: `apps/desktop/src/features/memory/MemoryPage.test.tsx`
- Test: `apps/desktop/src/features/settings/SettingsPage.test.tsx`

**Step 1: Write the failing tests**

Add compact-layout assertions for each page:

- no clipped primary controls at default desktop width
- consistent compact card shells and form rows
- scrollable content areas when panels exceed viewport height
- no fallback raw JSON-editing surface where field editing already exists

**Step 2: Run tests to verify they fail**

Run: `npm --prefix apps/desktop test -- src/features/team/TeamPage.test.tsx src/features/agents/AgentsPage.test.tsx src/features/memory/MemoryPage.test.tsx src/features/settings/SettingsPage.test.tsx -- --runInBand -t "uses the compact page shell"`
Expected: FAIL until the new page shells and compact selectors are in place

**Step 3: Write minimal implementation**

Tighten page shells and control group spacing without changing data flow, persistence, or runtime commands.

**Step 4: Run tests to verify they pass**

Run the same targeted tests.
Expected: PASS

**Step 5: Commit**

```bash
git add apps/desktop/src/features/team/TeamPage.tsx apps/desktop/src/features/agents/AgentsPage.tsx apps/desktop/src/features/memory/MemoryPage.tsx apps/desktop/src/features/settings/SettingsPage.tsx apps/desktop/src/features/team/TeamPage.test.tsx apps/desktop/src/features/agents/AgentsPage.test.tsx apps/desktop/src/features/memory/MemoryPage.test.tsx apps/desktop/src/features/settings/SettingsPage.test.tsx
git commit -m "feat: align desktop page density"
```

### Task 6: Coordinator integration, shared styling, and UI gate verification

**Files:**
- Modify: `apps/desktop/src/styles/theme.css`
- Verify: `apps/desktop/src/features/chat/ChatPage.tsx`
- Verify: `apps/desktop/src/features/chat/SessionTabs.tsx`
- Verify: `apps/desktop/src/features/chat/TeamRunPanel.tsx`
- Verify: `apps/desktop/src/features/team/TeamPage.tsx`
- Verify: `apps/desktop/src/features/agents/AgentsPage.tsx`
- Verify: `apps/desktop/src/features/memory/MemoryPage.tsx`
- Verify: `apps/desktop/src/features/settings/SettingsPage.tsx`

**Step 1: Integrate shared theme changes**

Move the approved compact shell, session rail, composer, team-run, and page-density rules into `apps/desktop/src/styles/theme.css`.

**Step 2: Run focused desktop tests**

Run: `npm --prefix apps/desktop test -- src/features/chat/ChatPage.test.tsx src/features/chat/TeamRunPanel.test.tsx src/features/team/TeamPage.test.tsx src/features/agents/AgentsPage.test.tsx src/features/memory/MemoryPage.test.tsx src/features/settings/SettingsPage.test.tsx -- --runInBand`
Expected: PASS

**Step 3: Run desktop build**

Run: `npm --prefix apps/desktop run build`
Expected: PASS

**Step 4: Run visual gate before P0 acceptance**

Using the real desktop app plus screenshots or Tauri snapshots, verify:

- chat header no longer collides with tabs
- tab rail scrolls, compresses, and exposes close affordances
- composer alignment is corrected at default zoom
- team run reads as a compact group conversation
- `Team`, `Agents`, `Memory`, and `Settings` share the new compact baseline

**Step 5: Commit**

```bash
git add apps/desktop/src/styles/theme.css
git commit -m "style: unify compact desktop shell"
```
