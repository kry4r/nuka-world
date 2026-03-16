# P0 Memory And Team Run Observability Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement the approved P0 redesign for `Memory`, `Chat > Team run > Agents`, and `Chat > Team run > Files` without leaving the desktop-owned execution model or inventing fake UI data.

**Architecture:** Rework only the existing desktop surfaces that already render these flows. Keep the `Memory` page owner-scoped and graph-first, keep `Team run` inside `Chat`, and turn the `Agents` and `Files` secondary views into denser inspection tools backed by real runtime data. Use targeted frontend tests for structure and copy, then validate each checkpoint with the single real Tauri app instance.

**Tech Stack:** React 19, TypeScript, Vitest, Tauri desktop shell, existing desktop i18n helpers, real Tauri MCP validation.

---

## Execution Constraints

- Work only inside `/Users/nidhogg/Desktop/Nuka/.worktrees/p0-desktop-control-plane`
- Keep P0 scope only
- Keep the existing single real desktop app instance; do not start another
- Only the coordinator connects Tauri MCP and runs page reviews
- Do not edit the unrelated dirty runtime files unless a task explicitly requires it
- Do not let two track tasks edit the same file at the same time
- Use `sequential-thinking` before every implementation task with at least 6 thoughts
- Use `sequential-thinking` before every Tauri review with at least 4 thoughts
- If a test, runtime path, or Tauri review fails unexpectedly, stop and use `systematic-debugging` before changing code

## Track Layout

### Coordinator

Owns:

- `apps/desktop/src/styles/theme.css`
- shared polish on touched surfaces
- merges between track tasks
- Tauri MCP reviews
- final cleanup and acceptance preparation

### Track B

Owns:

- `apps/desktop/src/features/chat/TeamRunPanel.tsx`
- `apps/desktop/src/features/chat/TeamRunPanel.test.tsx`
- `apps/desktop/src/features/chat/AgentTeamStrip.tsx`
- `apps/desktop/src/features/chat/RunEventFeed.tsx`
- `apps/desktop/src/features/chat/ChatPage.test.tsx`

Track B tasks must run serially because they touch the same chat run files.

### Track C

Owns:

- `apps/desktop/src/features/memory/MemoryPage.tsx`
- `apps/desktop/src/features/memory/MemoryPage.test.tsx`
- `apps/desktop/src/features/memory/MemoryGraphCanvas.tsx`
- `apps/desktop/src/features/memory/MemoryGraphControls.tsx`
- `apps/desktop/src/features/memory/MemoryNodeInspector.tsx`

Track C may run independently from Track B code edits, but coordinator review still happens after each completed task.

## Task 1: Rebuild Memory As A Graph-First Owner View

**Files:**
- Modify: `apps/desktop/src/features/memory/MemoryPage.tsx`
- Modify: `apps/desktop/src/features/memory/MemoryPage.test.tsx`
- Modify: `apps/desktop/src/features/memory/MemoryGraphCanvas.tsx`
- Modify: `apps/desktop/src/features/memory/MemoryGraphControls.tsx`
- Modify: `apps/desktop/src/features/memory/MemoryNodeInspector.tsx`
- Modify: `apps/desktop/src/styles/theme.css`

**Step 1: Run task-level sequential thinking**

Call `sequential-thinking` with at least 6 thoughts covering:

- fit to the approved design doc
- visual unity with the desktop shell
- user intuition
- consistency with existing shared shell patterns
- strict P0 scope
- file boundaries and regression risk

**Step 2: Write the failing tests**

Extend `apps/desktop/src/features/memory/MemoryPage.test.tsx` to assert:

- the page renders an owner rail with `Direct chat` and `Teams`
- the main surface renders a graph canvas without a permanent right inspector column
- node details open in an overlay or drawer after node selection
- the graph surface defaults to dot-plus-short-label semantics instead of card-sized node chrome

**Step 3: Run the tests to verify failure**

Run:

```bash
npm --prefix apps/desktop test -- src/features/memory/MemoryPage.test.tsx -- --runInBand
```

Expected:

- FAIL on the new owner rail and graph-first assertions
- existing tests may still pass on unrelated behavior

**Step 4: Implement the minimal graph-first layout**

Update the page to:

- replace the current scope dropdown and persistent detail panel structure with a left owner rail
- keep the graph canvas as the dominant central surface
- open node details in an overlay or drawer
- remove board-like card chrome from the graph nodes

**Step 5: Implement the minimal graph styling and interactions**

Update the graph canvas to:

- render round node markers with short labels
- keep stable hover and selected states
- dim unrelated nodes when one is selected
- preserve pan, zoom, and fit behavior

Do not add unsupported graph editing features.

**Step 6: Run the tests to verify they pass**

Run:

```bash
npm --prefix apps/desktop test -- src/features/memory/MemoryPage.test.tsx -- --runInBand
```

Expected:

- PASS

**Step 7: Commit the task**

```bash
git -C /Users/nidhogg/Desktop/Nuka/.worktrees/p0-desktop-control-plane add \
  apps/desktop/src/features/memory/MemoryPage.tsx \
  apps/desktop/src/features/memory/MemoryPage.test.tsx \
  apps/desktop/src/features/memory/MemoryGraphCanvas.tsx \
  apps/desktop/src/features/memory/MemoryGraphControls.tsx \
  apps/desktop/src/features/memory/MemoryNodeInspector.tsx \
  apps/desktop/src/styles/theme.css
git -C /Users/nidhogg/Desktop/Nuka/.worktrees/p0-desktop-control-plane commit -m "feat: redesign memory graph view"
```

**Step 8: Plan the Tauri review**

Call `sequential-thinking` with at least 4 thoughts covering:

- exact page and state to review
- likely layout failure points
- places where the graph might look usable but visually wrong
- pass versus fail evidence

**Step 9: Run the real Tauri review**

Using the already-running real app instance:

- open `Memory`
- switch between `Direct chat` and at least one team owner
- verify the graph reads as a dynamic relationship graph
- verify hover does not shift layout
- verify detail overlay placement and scroll behavior

Save screenshots in `tmp/`.

**Step 10: If the review fails, debug before patching**

Use `systematic-debugging`, then repeat the red-green-fix-review loop before moving on.

## Task 2: Rebuild Team Run Agents As A Per-Agent Execution Timeline

**Files:**
- Modify: `apps/desktop/src/features/chat/TeamRunPanel.tsx`
- Modify: `apps/desktop/src/features/chat/TeamRunPanel.test.tsx`
- Modify: `apps/desktop/src/features/chat/ChatPage.test.tsx`
- Modify: `apps/desktop/src/styles/theme.css`

**Step 1: Run task-level sequential thinking**

Call `sequential-thinking` with at least 6 thoughts covering the approved `Agents` redesign and the regression risk to the existing team run conversation surface.

**Step 2: Write the failing tests**

Extend `apps/desktop/src/features/chat/TeamRunPanel.test.tsx` and `apps/desktop/src/features/chat/ChatPage.test.tsx` to assert:

- the `Agents` secondary view renders a left agent list and a right selected-agent timeline
- the coordinator is visually distinct but remains a peer item, not a parent node
- the right side uses distinct cards for instruction, thinking, reply, tool call, and state change events
- the bottom follow-up composer remains fixed outside the scrollable agent timeline
- no redundant helper copy or add-agent form remains in the `Agents` secondary view

**Step 3: Run the tests to verify failure**

Run:

```bash
npm --prefix apps/desktop test -- src/features/chat/TeamRunPanel.test.tsx src/features/chat/ChatPage.test.tsx -- --runInBand
```

Expected:

- FAIL on the new `Agents` structure and event-card assertions

**Step 4: Implement the minimal left-list/right-timeline layout**

Update the `Agents` secondary view to:

- render one pinned coordinator row plus peer execution-agent rows
- select an agent and show its unified execution timeline on the right
- remove the current add-agent card from this view

**Step 5: Implement minimal event card differentiation**

Render distinct visual treatments for:

- instruction events
- thinking events
- reply events
- tool call events
- state changes

Keep everything within one ordered stream and preserve real run data only.

**Step 6: Ensure footer composer stability**

Adjust the team run layout so:

- the content region fills the available height
- internal view panels scroll independently
- the follow-up composer stays pinned in the footer
- hover and focus do not cause clipping or motion

**Step 7: Run the tests to verify they pass**

Run:

```bash
npm --prefix apps/desktop test -- src/features/chat/TeamRunPanel.test.tsx src/features/chat/ChatPage.test.tsx -- --runInBand
```

Expected:

- PASS

**Step 8: Commit the task**

```bash
git -C /Users/nidhogg/Desktop/Nuka/.worktrees/p0-desktop-control-plane add \
  apps/desktop/src/features/chat/TeamRunPanel.tsx \
  apps/desktop/src/features/chat/TeamRunPanel.test.tsx \
  apps/desktop/src/features/chat/ChatPage.test.tsx \
  apps/desktop/src/styles/theme.css
git -C /Users/nidhogg/Desktop/Nuka/.worktrees/p0-desktop-control-plane commit -m "feat: redesign team run agents view"
```

**Step 9: Plan the Tauri review**

Call `sequential-thinking` with at least 4 thoughts focused on:

- `Chat > Team run > Agents`
- hover and scroll failure points
- card readability versus label clutter
- pass versus fail evidence

**Step 10: Run the real Tauri review**

Using the existing real app instance:

- open an active team run
- open `Agents`
- verify the left list / right timeline structure
- verify coordinator versus execution styling
- verify card distinctions
- verify footer composer pinning
- verify hover and focus do not break layout

Save screenshots in `tmp/`.

**Step 11: If the review fails, debug before patching**

Use `systematic-debugging`, then repeat the TDD loop before moving on.

## Task 3: Rebuild Team Run Files As A VS Code-Like Change Explorer

**Files:**
- Modify: `apps/desktop/src/features/chat/TeamRunPanel.tsx`
- Modify: `apps/desktop/src/features/chat/TeamRunPanel.test.tsx`
- Modify: `apps/desktop/src/features/chat/ChatPage.test.tsx`
- Modify: `apps/desktop/src/styles/theme.css`
- Inspect only if needed: `apps/desktop/src/lib/team.ts`

**Step 1: Run task-level sequential thinking**

Call `sequential-thinking` with at least 6 thoughts covering the approved `Files` redesign, the truthfulness constraint for diff rendering, and the shared file boundary with Task 2.

**Step 2: Write the failing tests**

Extend `apps/desktop/src/features/chat/TeamRunPanel.test.tsx` and `apps/desktop/src/features/chat/ChatPage.test.tsx` to assert:

- the `Files` secondary view renders a left grouped file tree and a right preview pane
- groups are organized by round or batch
- selecting a file changes the preview pane content
- the preview pane honestly distinguishes between real diff data and metadata-only fallback

If the current test fixtures do not include patch data, add a test fixture that covers both:

- a file entry with real diff text
- a file entry without diff text

Do not change production data contracts just to simplify the test.

**Step 3: Run the tests to verify failure**

Run:

```bash
npm --prefix apps/desktop test -- src/features/chat/TeamRunPanel.test.tsx src/features/chat/ChatPage.test.tsx -- --runInBand
```

Expected:

- FAIL on the grouped file tree and preview assertions

**Step 4: Inspect the current file timeline payload shape**

Review `apps/desktop/src/lib/team.ts` and the current event data usage to determine whether real diff or hunk content already exists.

If patch content exists:

- surface it in the preview pane

If patch content does not exist:

- implement the metadata fallback pane and label it honestly

**Step 5: Implement the minimal two-column file explorer**

Update the `Files` secondary view to:

- render a collapsible grouped file tree on the left
- render a read-only preview pane on the right
- highlight the selected file
- keep the layout stable for long lists and long previews

**Step 6: Run the tests to verify they pass**

Run:

```bash
npm --prefix apps/desktop test -- src/features/chat/TeamRunPanel.test.tsx src/features/chat/ChatPage.test.tsx -- --runInBand
```

Expected:

- PASS

**Step 7: Commit the task**

```bash
git -C /Users/nidhogg/Desktop/Nuka/.worktrees/p0-desktop-control-plane add \
  apps/desktop/src/features/chat/TeamRunPanel.tsx \
  apps/desktop/src/features/chat/TeamRunPanel.test.tsx \
  apps/desktop/src/features/chat/ChatPage.test.tsx \
  apps/desktop/src/styles/theme.css
git -C /Users/nidhogg/Desktop/Nuka/.worktrees/p0-desktop-control-plane commit -m "feat: redesign team run files view"
```

**Step 8: Plan the Tauri review**

Call `sequential-thinking` with at least 4 thoughts focused on:

- grouped file tree readability
- preview honesty
- overflow and truncation
- pass versus fail evidence

**Step 9: Run the real Tauri review**

Using the existing real app instance:

- open `Chat > Team run > Files`
- verify grouped file batches
- verify file selection
- verify real diff rendering or explicit metadata fallback
- verify no fake editor path appears

Save screenshots in `tmp/`.

**Step 10: If the review fails, debug before patching**

Use `systematic-debugging`, then repeat the TDD loop before moving on.

## Coordinator Cleanup And Verification Gate

After Tasks 1 through 3:

1. Run targeted frontend tests again:

```bash
npm --prefix apps/desktop test -- \
  src/features/memory/MemoryPage.test.tsx \
  src/features/chat/TeamRunPanel.test.tsx \
  src/features/chat/ChatPage.test.tsx \
  -- --runInBand
```

2. Run formatting and diff hygiene:

```bash
npm --prefix apps/desktop exec prettier --check src/features/memory src/features/chat
git -C /Users/nidhogg/Desktop/Nuka/.worktrees/p0-desktop-control-plane diff --check
```

3. Run a desktop build smoke check:

```bash
npm --prefix apps/desktop run build
```

4. Run a final Tauri MCP sweep on the touched pages:

- `Memory`
- `Chat > Team run > Agents`
- `Chat > Team run > Files`

5. Capture evidence in `tmp/` and append notes for the broader P0 acceptance run.

## Deliverables

- graph-first `Memory`
- per-agent team run execution timeline
- VS Code-like team run file explorer
- passing targeted desktop tests
- fresh Tauri review notes and screenshots for every touched surface
