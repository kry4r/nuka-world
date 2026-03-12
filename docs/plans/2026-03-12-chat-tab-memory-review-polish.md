# Chat Tab And Memory Review Polish Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove session text mojibake, make Chat session tabs use a uniform browser-style width strategy, and flatten the inline memory review card around node detail plus related node names.

**Architecture:** Keep storage unchanged. Enrich the desktop memory command response with node detail and related node titles, then update the desktop React surface to render the richer candidate payload. Session tab sizing remains a frontend-only change in the shared Chat tab component and theme stylesheet.

**Tech Stack:** React 19, Vitest, Tauri 2, Rust, shared desktop theme CSS

---

### Task 1: Lock Chat Text And Tab Expectations

**Files:**
- Modify: `apps/desktop/src/features/chat/ChatPage.test.tsx`

**Step 1: Write the failing test**

Add coverage that:
- the chat meta separator is rendered as `·`
- session ids truncate with `…`
- the session tab bar exposes the uniform browser-tab class hooks

**Step 2: Run test to verify it fails**

Run: `npx vitest run --pool=threads apps/desktop/src/features/chat/ChatPage.test.tsx`

Expected: FAIL because the current UI still renders mojibake text and lacks the new uniform tab class hooks.

**Step 3: Write minimal implementation**

Update the Chat page constants and SessionTabs markup/class names only as needed to satisfy the tests.

**Step 4: Run test to verify it passes**

Run: `npx vitest run --pool=threads apps/desktop/src/features/chat/ChatPage.test.tsx`

Expected: PASS

**Step 5: Commit**

```bash
git add apps/desktop/src/features/chat/ChatPage.test.tsx apps/desktop/src/features/chat/ChatPage.tsx apps/desktop/src/features/chat/SessionTabs.tsx apps/desktop/src/styles/theme.css
git commit -m "fix: normalize chat session tabs and labels"
```

### Task 2: Lock Memory Review Payload And Card Rendering

**Files:**
- Modify: `apps/desktop/src-tauri/src/commands/memory.rs`
- Modify: `apps/desktop/src/lib/memory.ts`
- Modify: `apps/desktop/src/components/memory/MemoryReviewDock.tsx`
- Modify: `apps/desktop/src/features/chat/ChatPage.test.tsx`

**Step 1: Write the failing test**

Add backend coverage that pending memory candidate responses expose:
- node body
- related node titles

Add frontend coverage that the inline memory review card shows:
- node name as the title
- memory detail body text
- related node name chips
- only the three decision buttons

And does not show the removed review copy or stats.

**Step 2: Run test to verify it fails**

Run:
- `cargo test -p desktop-tauri commands::memory::tests::list_pending_memory_candidates_includes_node_detail_and_related_titles -- --exact`
- `npx vitest run --pool=threads apps/desktop/src/features/chat/ChatPage.test.tsx`

Expected: FAIL because the current response and card do not include the richer detail or flattened layout.

**Step 3: Write minimal implementation**

Enrich the Tauri memory response by joining the candidate node against the in-memory graph, then update the frontend type and inline card rendering.

**Step 4: Run test to verify it passes**

Run the same commands from Step 2.

Expected: PASS

**Step 5: Commit**

```bash
git add apps/desktop/src-tauri/src/commands/memory.rs apps/desktop/src/lib/memory.ts apps/desktop/src/components/memory/MemoryReviewDock.tsx apps/desktop/src/features/chat/ChatPage.test.tsx apps/desktop/src/styles/theme.css
git commit -m "feat: flatten memory review inline card"
```

### Task 3: Verify The Combined Surface

**Files:**
- Modify: `apps/desktop/src/styles/theme.css`

**Step 1: Write the failing test**

Use the existing Chat page expectations to cover the final combined UI contract after the first two tasks.

**Step 2: Run test to verify it fails**

Run:
- `npx vitest run --pool=threads apps/desktop/src/features/chat/ChatPage.test.tsx`

Expected: FAIL until the last style/layout details are complete.

**Step 3: Write minimal implementation**

Finish the uniform tab sizing and flattened memory card styling without changing behavior beyond the approved design.

**Step 4: Run test to verify it passes**

Run:
- `npx vitest run --pool=threads apps/desktop/src/features/chat/ChatPage.test.tsx`
- `cargo test -p desktop-tauri commands::memory::tests::list_pending_memory_candidates_includes_node_detail_and_related_titles -- --exact`

Expected: PASS

**Step 5: Commit**

```bash
git add apps/desktop/src/styles/theme.css
git commit -m "style: polish chat tabs and memory review card"
```
