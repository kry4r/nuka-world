# P0 Desktop Copy And Localization Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove low-value helper copy from the P0 desktop UI and add a lightweight locale system with Chinese as the default language.

**Architecture:** Add a small frontend locale layer that lives entirely in the desktop app, persists the active locale locally, and exposes translated labels to the shared shell and P0 pages. Remove useless helper copy instead of translating it, and keep page-specific wording owned by the page modules that render it.

**Tech Stack:** React 19, TypeScript, Vitest, existing desktop theme CSS, Tauri desktop frontend

---

## Working Rules

- Stay inside `Chat`, `Team`, `Agents`, `Memory`, `Settings`, and the shared shell
- Default locale must be Chinese
- Remove low-value helper text instead of replacing it with new filler
- Follow TDD for every task
- Validate each completed UI batch in the existing single-instance Tauri app
- Do not touch unrelated dirty files:
  - `apps/desktop/package-lock.json`
  - `apps/desktop/src-tauri/Cargo.toml`
  - `apps/desktop/src-tauri/gen/schemas/macOS-schema.json`

## Task 1: Add the lightweight locale foundation

**Files:**
- Create: `apps/desktop/src/lib/i18n.ts`
- Modify: `apps/desktop/src/App.tsx`
- Modify: `apps/desktop/src/App.test.tsx`
- Modify: `apps/desktop/src/features/settings/SettingsPage.tsx`
- Modify: `apps/desktop/src/features/settings/SettingsPage.test.tsx`

**Step 1: Write the failing test**

Add tests that require:

- the desktop UI defaults to Chinese labels
- locale can be switched from `Settings > Appearance`
- the selected locale persists for the next render

**Step 2: Run test to verify it fails**

Run:

```bash
npm --prefix apps/desktop test -- src/App.test.tsx src/features/settings/SettingsPage.test.tsx -- --runInBand
```

Expected: FAIL because no locale layer or locale switch exists yet.

**Step 3: Write minimal implementation**

Add the locale dictionary, persistence helper, and settings control with the smallest possible integration surface.

**Step 4: Run test to verify it passes**

Run the same command.

Expected: PASS

**Step 5: Commit**

```bash
git -C /Users/nidhogg/Desktop/Nuka/.worktrees/p0-desktop-control-plane add \
  apps/desktop/src/lib/i18n.ts \
  apps/desktop/src/App.tsx \
  apps/desktop/src/App.test.tsx \
  apps/desktop/src/features/settings/SettingsPage.tsx \
  apps/desktop/src/features/settings/SettingsPage.test.tsx
git -C /Users/nidhogg/Desktop/Nuka/.worktrees/p0-desktop-control-plane commit -m "feat: add desktop locale foundation"
```

## Task 2: Clean and localize shared shell plus chat chrome

**Files:**
- Modify: `apps/desktop/src/components/shell/AppShell.tsx`
- Modify: `apps/desktop/src/components/shell/Sidebar.tsx`
- Modify: `apps/desktop/src/features/chat/SessionTabs.tsx`
- Modify: `apps/desktop/src/features/chat/ChatPage.tsx`
- Modify: `apps/desktop/src/features/chat/ChatPage.test.tsx`
- Modify: `apps/desktop/src/styles/theme.css`

**Step 1: Write the failing test**

Add tests that require:

- localized shell navigation labels
- localized chat chrome text
- horizontal tab scrolling still works with many tabs and translated labels

**Step 2: Run test to verify it fails**

Run:

```bash
npm --prefix apps/desktop test -- src/features/chat/ChatPage.test.tsx src/App.test.tsx -- --runInBand
```

Expected: FAIL because the current shell/chat text is hard-coded and the overflow contract is incomplete.

**Step 3: Write minimal implementation**

Localize only the visible shell/chat strings required for P0 and tighten the tab rail overflow behavior without changing chat semantics.

**Step 4: Run test to verify it passes**

Run the same command.

Expected: PASS

**Step 5: Commit**

```bash
git -C /Users/nidhogg/Desktop/Nuka/.worktrees/p0-desktop-control-plane add \
  apps/desktop/src/components/shell/AppShell.tsx \
  apps/desktop/src/components/shell/Sidebar.tsx \
  apps/desktop/src/features/chat/SessionTabs.tsx \
  apps/desktop/src/features/chat/ChatPage.tsx \
  apps/desktop/src/features/chat/ChatPage.test.tsx \
  apps/desktop/src/styles/theme.css
git -C /Users/nidhogg/Desktop/Nuka/.worktrees/p0-desktop-control-plane commit -m "fix: localize shell and chat chrome"
```

## Task 3: Clean and localize Team, Agents, and Memory copy

**Files:**
- Modify: `apps/desktop/src/features/team/**`
- Modify: `apps/desktop/src/features/agents/**`
- Modify: `apps/desktop/src/features/memory/**`

**Step 1: Write the failing test**

Add or extend page tests to require:

- removal of low-value helper text
- localized section and action labels
- unchanged page behavior after copy cleanup

**Step 2: Run test to verify it fails**

Run:

```bash
npm --prefix apps/desktop test -- src/features/team src/features/agents src/features/memory -- --runInBand
```

Expected: FAIL because those pages still contain hard-coded English and helper prose.

**Step 3: Write minimal implementation**

Remove useless copy, wire the remaining visible strings into the locale dictionary, and keep the page structure unchanged.

**Step 4: Run test to verify it passes**

Run the same command.

Expected: PASS

**Step 5: Commit**

```bash
git -C /Users/nidhogg/Desktop/Nuka/.worktrees/p0-desktop-control-plane add \
  apps/desktop/src/features/team \
  apps/desktop/src/features/agents \
  apps/desktop/src/features/memory
git -C /Users/nidhogg/Desktop/Nuka/.worktrees/p0-desktop-control-plane commit -m "fix: localize p0 management pages"
```

## Task 4: Real desktop review and P0 acceptance continuation

**Files:**
- No new product files required

**Step 1: Run targeted desktop tests and build checks**

Run the relevant frontend tests after each task, then the broader P0 desktop checks before acceptance.

**Step 2: Review in the real Tauri app**

Use the existing single desktop instance and Tauri MCP connection to verify:

- Chinese is the default UI language
- locale switching works from `Settings > Appearance`
- removed helper copy is no longer visible
- chat tab rail still scrolls correctly with many tabs

**Step 3: Capture evidence**

Keep screenshots, DOM/accessibility observations, and command output summaries for the final acceptance report.
