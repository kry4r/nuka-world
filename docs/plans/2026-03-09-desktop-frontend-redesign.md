# Desktop Frontend Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Redesign the desktop frontend into a mode-aware AI workbench centered on `Chat`, `Workflow`, a graph-based `Memory` system, and an engine-aware but secondary `Knowledge` workbench.

**Architecture:** Keep the existing `Tauri + React + TypeScript` stack, replace the generic card-led layout with page-specific task surfaces, and extend the Rust/Tauri command layer where the new UI requires richer contracts. Implement the work in vertical slices: shell and design system first, then `Chat`, `Workflow`, `Memory`, `Knowledge`, and finally `Agents` plus `Settings` harmonization.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, Tauri 2, Rust, SQLx-backed runtime services, existing `apps/desktop` feature structure, `cargo test`, `npm.cmd --prefix apps/desktop test`.

---

### Task 1: Rebuild the shell primitives and design tokens

**Files:**
- Modify: `apps/desktop/src/styles/tokens.css`
- Modify: `apps/desktop/src/styles/theme.css`
- Modify: `apps/desktop/src/components/brand/NukaLockup.tsx`
- Modify: `apps/desktop/src/components/brand/NukaLogo.tsx`
- Modify: `apps/desktop/src/components/shell/AppShell.tsx`
- Modify: `apps/desktop/src/components/shell/Sidebar.tsx`
- Modify: `apps/desktop/src/components/shell/Inspector.tsx`
- Create: `apps/desktop/src/components/shell/StatusStrip.tsx`
- Create: `apps/desktop/src/components/shell/PageSurface.tsx`
- Modify: `apps/desktop/src/App.tsx`
- Test: `apps/desktop/src/App.test.tsx`
- Test: `apps/desktop/src/components/brand/NukaBrand.test.tsx`

**Step 1: Write the failing shell tests**

Add tests that assert:

- the app renders a persistent left navigation rail,
- the shell renders a top status strip,
- the shell uses the new `nuka.svg`-based brand lockup instead of `goodlogo.png`,
- the inspector can render as a contextual utility panel rather than a permanent summary stack.

**Step 2: Run tests to verify they fail**

Run: `npm.cmd --prefix apps/desktop test -- src/App.test.tsx src/components/brand/NukaBrand.test.tsx`

Expected:

- FAIL because the current shell does not include the new primitives,
- FAIL because the brand lockup still points at `goodlogo.png`.

**Step 3: Implement the minimal shell redesign**

Use these target contracts:

```tsx
// apps/desktop/src/components/shell/StatusStrip.tsx
type StatusStripProps = {
  pageLabel: string;
  contextLabel?: string;
  runtimeLabel?: string;
};
```

```tsx
// apps/desktop/src/components/brand/NukaLockup.tsx
import nukaMark from "@/assets/nuka.svg";
```

```css
/* apps/desktop/src/styles/tokens.css */
:root {
  --color-canvas: #f4efe7;
  --color-surface: #fbf8f2;
  --color-surface-muted: #f1ebe1;
  --color-ink: #1f1b18;
  --color-ink-soft: #6e655c;
  --color-line: #ddd2c4;
  --color-state-ready: #75846f;
  --color-state-busy: #b68e5a;
  --color-state-error: #a06a5c;
}
```

Replace the current card-led shell styling with a true `left rail + main task surface + contextual inspector` frame.

**Step 4: Run tests to verify they pass**

Run: `npm.cmd --prefix apps/desktop test -- src/App.test.tsx src/components/brand/NukaBrand.test.tsx`

Expected: PASS

**Step 5: Commit**

```bash
git add apps/desktop/src/App.tsx apps/desktop/src/components/brand/NukaLockup.tsx apps/desktop/src/components/brand/NukaLogo.tsx apps/desktop/src/components/shell/AppShell.tsx apps/desktop/src/components/shell/Sidebar.tsx apps/desktop/src/components/shell/Inspector.tsx apps/desktop/src/components/shell/StatusStrip.tsx apps/desktop/src/components/shell/PageSurface.tsx apps/desktop/src/styles/tokens.css apps/desktop/src/styles/theme.css apps/desktop/src/App.test.tsx apps/desktop/src/components/brand/NukaBrand.test.tsx
git commit -m "feat: rebuild desktop shell primitives"
```

### Task 2: Add mode-aware Chat entry with explicit composer context

**Files:**
- Modify: `apps/desktop/src/features/chat/ChatPage.tsx`
- Modify: `apps/desktop/src/lib/chat.ts`
- Create: `apps/desktop/src/features/chat/ChatModeSwitcher.tsx`
- Create: `apps/desktop/src/features/chat/SuggestionStrip.tsx`
- Create: `apps/desktop/src/features/chat/ConversationEventBlock.tsx`
- Modify: `apps/desktop/src/features/chat/ChatPage.test.tsx`
- Modify: `apps/desktop/src-tauri/src/commands/chat.rs`
- Modify: `crates/nuka-runtime/src/world.rs`
- Modify: `crates/nuka-runtime/src/session.rs`
- Test: `apps/desktop/src/features/chat/ChatPage.test.tsx`
- Test: `apps/desktop/src-tauri/src/commands/chat.rs`
- Test: `crates/nuka-runtime/src/world.rs`

**Step 1: Write the failing tests**

Frontend tests:

- Chat landing renders `Chat only`, `Create workflow`, and `Specific workflow`
- `Specific workflow` mode requires a selected workflow before send
- suggestion strip renders three recommended next-step actions and writes the chosen action into the transcript

Backend tests:

- `route_world_prompt` accepts a mode value
- `Specific workflow` mode returns route metadata tied to a workflow id
- world sessions preserve the chosen mode

**Step 2: Run tests to verify they fail**

Run:

- `npm.cmd --prefix apps/desktop test -- src/features/chat/ChatPage.test.tsx`
- `cargo test -p desktop-tauri chat::`
- `cargo test -p nuka-runtime world::`

Expected:

- FAIL because Chat has no mode switcher or suggestion strip,
- FAIL because the Tauri and runtime layers do not model explicit chat modes.

**Step 3: Implement the minimal feature slice**

Add a mode contract:

```ts
// apps/desktop/src/lib/chat.ts
export type ChatMode =
  | { kind: "chat_only" }
  | { kind: "create_workflow" }
  | { kind: "specific_workflow"; workflowId: string };
```

```rust
// apps/desktop/src-tauri/src/commands/chat.rs
#[derive(Debug, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum ChatModeInput {
    ChatOnly,
    CreateWorkflow,
    SpecificWorkflow { workflow_id: String },
}
```

```rust
// crates/nuka-runtime/src/world.rs
pub enum WorldChatMode {
    ChatOnly,
    CreateWorkflow,
    SpecificWorkflow(String),
}
```

Render the switcher beside the composer context and introduce a stage-aware suggestion strip above the composer in active chat sessions.

**Step 4: Run tests to verify they pass**

Run:

- `npm.cmd --prefix apps/desktop test -- src/features/chat/ChatPage.test.tsx`
- `cargo test -p desktop-tauri chat::`
- `cargo test -p nuka-runtime world::`

Expected: PASS

**Step 5: Commit**

```bash
git add apps/desktop/src/features/chat/ChatPage.tsx apps/desktop/src/features/chat/ChatModeSwitcher.tsx apps/desktop/src/features/chat/SuggestionStrip.tsx apps/desktop/src/features/chat/ConversationEventBlock.tsx apps/desktop/src/features/chat/ChatPage.test.tsx apps/desktop/src/lib/chat.ts apps/desktop/src-tauri/src/commands/chat.rs crates/nuka-runtime/src/world.rs crates/nuka-runtime/src/session.rs
git commit -m "feat: add mode-aware chat entry and guided suggestions"
```

### Task 3: Turn Workflow into a lobby plus dedicated conversation room

**Files:**
- Modify: `apps/desktop/src/features/workflow/WorkflowPage.tsx`
- Create: `apps/desktop/src/features/workflow/WorkflowLobby.tsx`
- Create: `apps/desktop/src/features/workflow/WorkflowRoom.tsx`
- Create: `apps/desktop/src/features/workflow/WorkflowTimeline.tsx`
- Modify: `apps/desktop/src/features/workflow/AgentColumn.tsx`
- Modify: `apps/desktop/src/lib/workflow.ts`
- Modify: `apps/desktop/src-tauri/src/commands/workflow.rs`
- Modify: `crates/nuka-runtime/src/workflow_world.rs`
- Modify: `crates/nuka-runtime/src/workflow.rs`
- Test: `apps/desktop/src/features/workflow/WorkflowPage.test.tsx`
- Test: `apps/desktop/src-tauri/src/commands/workflow.rs`

**Step 1: Write the failing tests**

Add tests that assert:

- Workflow page renders a lobby when no session is active
- starting a workflow opens a workflow room
- workflow room renders conversation transcript plus timeline events
- a workflow session can accept a follow-up message after start

**Step 2: Run tests to verify they fail**

Run:

- `npm.cmd --prefix apps/desktop test -- src/features/workflow/WorkflowPage.test.tsx`
- `cargo test -p desktop-tauri workflow::`

Expected:

- FAIL because Workflow currently only starts a session and shows a summary card,
- FAIL because there is no workflow-room message continuation command.

**Step 3: Implement the minimal vertical slice**

Extend the frontend model:

```ts
// apps/desktop/src/lib/workflow.ts
export type WorkflowEvent =
  | { kind: "user_message"; id: string; content: string }
  | { kind: "assistant_message"; id: string; content: string }
  | { kind: "node_event"; id: string; title: string; status: string; detail?: string };
```

Extend the backend contract:

```rust
// apps/desktop/src-tauri/src/commands/workflow.rs
#[tauri::command]
pub async fn continue_workflow_session(
    session_id: String,
    prompt: String,
    state: tauri::State<'_, crate::app_state::AppState>,
) -> Result<WorkflowRoomResponse, String>
```

Create a room UI with:

- a workflow status strip,
- transcript column,
- event/timeline blocks,
- workflow-specific composer,
- contextual inspector content.

**Step 4: Run tests to verify they pass**

Run:

- `npm.cmd --prefix apps/desktop test -- src/features/workflow/WorkflowPage.test.tsx`
- `cargo test -p desktop-tauri workflow::`
- `cargo test -p nuka-runtime workflow_world::`

Expected: PASS

**Step 5: Commit**

```bash
git add apps/desktop/src/features/workflow/WorkflowPage.tsx apps/desktop/src/features/workflow/WorkflowLobby.tsx apps/desktop/src/features/workflow/WorkflowRoom.tsx apps/desktop/src/features/workflow/WorkflowTimeline.tsx apps/desktop/src/features/workflow/AgentColumn.tsx apps/desktop/src/features/workflow/WorkflowPage.test.tsx apps/desktop/src/lib/workflow.ts apps/desktop/src-tauri/src/commands/workflow.rs crates/nuka-runtime/src/workflow_world.rs crates/nuka-runtime/src/workflow.rs
git commit -m "feat: redesign workflow as lobby and conversation room"
```

### Task 4: Replace the generic memory reader with a graph data model and editable graph commands

**Files:**
- Modify: `crates/nuka-domain/src/memory.rs`
- Modify: `crates/nuka-storage/src/memory.rs`
- Modify: `crates/nuka-runtime/src/memory_service.rs`
- Modify: `apps/desktop/src-tauri/src/commands/memory.rs`
- Modify: `apps/desktop/src/lib/memory.ts`
- Modify: `apps/desktop/src/features/memory/MemoryPage.tsx`
- Create: `apps/desktop/src/features/memory/MemoryGraphCanvas.tsx`
- Create: `apps/desktop/src/features/memory/MemoryNodeInspector.tsx`
- Create: `apps/desktop/src/features/memory/MemoryGraphControls.tsx`
- Modify: `apps/desktop/src/features/memory/MemoryPage.test.tsx`
- Test: `apps/desktop/src-tauri/src/commands/memory.rs`
- Test: `apps/desktop/src/features/memory/MemoryPage.test.tsx`

**Step 1: Write the failing tests**

Add backend tests that assert:

- graph read returns nodes and edges
- node update persists a changed title/body
- node delete removes the node and its edges

Add frontend tests that assert:

- Memory page renders a graph canvas instead of a card grid
- selecting a node opens editable inspector fields
- delete flow asks for confirmation

**Step 2: Run tests to verify they fail**

Run:

- `cargo test -p desktop-tauri memory::`
- `cargo test -p nuka-runtime memory_service::`
- `npm.cmd --prefix apps/desktop test -- src/features/memory/MemoryPage.test.tsx`

Expected:

- FAIL because memory currently exposes list/detail read-only scope APIs,
- FAIL because the React page has no graph canvas or edit controls.

**Step 3: Implement the minimal graph contract**

Replace the scope-only contract with graph-aware structs:

```rust
// crates/nuka-domain/src/memory.rs
pub struct MemoryGraph {
    pub nodes: Vec<MemoryGraphNode>,
    pub edges: Vec<MemoryGraphEdge>,
}

pub struct MemoryGraphNode {
    pub id: String,
    pub kind: MemoryNodeKind,
    pub title: String,
    pub body: Option<String>,
}

pub struct MemoryGraphEdge {
    pub id: String,
    pub source_id: String,
    pub target_id: String,
    pub relation: String,
}
```

Add Tauri commands for:

- `load_memory_graph`
- `update_memory_node`
- `delete_memory_node`
- `create_memory_edge`
- `delete_memory_edge`

Render a focused graph canvas with pan, zoom, node selection, and inspector-based editing.

**Step 4: Run tests to verify they pass**

Run:

- `cargo test -p desktop-tauri memory::`
- `cargo test -p nuka-runtime memory_service::`
- `npm.cmd --prefix apps/desktop test -- src/features/memory/MemoryPage.test.tsx`

Expected: PASS

**Step 5: Commit**

```bash
git add crates/nuka-domain/src/memory.rs crates/nuka-storage/src/memory.rs crates/nuka-runtime/src/memory_service.rs apps/desktop/src-tauri/src/commands/memory.rs apps/desktop/src/lib/memory.ts apps/desktop/src/features/memory/MemoryPage.tsx apps/desktop/src/features/memory/MemoryGraphCanvas.tsx apps/desktop/src/features/memory/MemoryNodeInspector.tsx apps/desktop/src/features/memory/MemoryGraphControls.tsx apps/desktop/src/features/memory/MemoryPage.test.tsx
git commit -m "feat: add memory graph workbench and graph CRUD"
```

### Task 5: Refactor Knowledge into a split workbench with engine-aware contracts

**Files:**
- Modify: `crates/nuka-domain/src/knowledge.rs`
- Modify: `crates/nuka-runtime/src/knowledge_service.rs`
- Modify: `apps/desktop/src-tauri/src/commands/knowledge.rs`
- Modify: `apps/desktop/src/lib/knowledge.ts`
- Modify: `apps/desktop/src/features/knowledge/KnowledgePage.tsx`
- Create: `apps/desktop/src/features/knowledge/KnowledgeWorkbench.tsx`
- Create: `apps/desktop/src/features/knowledge/LibraryExplorer.tsx`
- Create: `apps/desktop/src/features/knowledge/KnowledgeSearchLab.tsx`
- Create: `apps/desktop/src/features/knowledge/KnowledgeJobsPanel.tsx`
- Create: `apps/desktop/src/features/knowledge/KnowledgeEnginePanel.tsx`
- Modify: `apps/desktop/src/features/knowledge/KnowledgePage.test.tsx`
- Test: `apps/desktop/src-tauri/src/commands/knowledge.rs`
- Test: `apps/desktop/src/features/knowledge/KnowledgePage.test.tsx`

**Step 1: Write the failing tests**

Add tests that assert:

- Knowledge page renders libraries in a persistent explorer
- the main workspace switches between `Search`, `Sources`, `Jobs`, and `Engine`
- engine details include health and capability data
- collections can expose engine metadata distinct from source metadata

**Step 2: Run tests to verify they fail**

Run:

- `npm.cmd --prefix apps/desktop test -- src/features/knowledge/KnowledgePage.test.tsx`
- `cargo test -p desktop-tauri knowledge::`

Expected:

- FAIL because Knowledge is still connector-first and page-index-only in the UI contract,
- FAIL because the backend command layer does not return explicit engine summaries.

**Step 3: Implement the minimal engine-aware redesign**

Extend the domain:

```rust
// crates/nuka-domain/src/knowledge.rs
pub struct KnowledgeEngineSummary {
    pub id: String,
    pub label: String,
    pub health: String,
    pub capabilities: Vec<String>,
}
```

Expose engine-aware Tauri responses that distinguish:

- library identity,
- connector identity,
- index jobs,
- engine summary.

Render Knowledge as a split workbench with:

- left library explorer,
- top search/actions bar,
- central mode switcher,
- right contextual inspector.

**Step 4: Run tests to verify they pass**

Run:

- `npm.cmd --prefix apps/desktop test -- src/features/knowledge/KnowledgePage.test.tsx`
- `cargo test -p desktop-tauri knowledge::`
- `cargo test -p nuka-runtime knowledge_service::`

Expected: PASS

**Step 5: Commit**

```bash
git add crates/nuka-domain/src/knowledge.rs crates/nuka-runtime/src/knowledge_service.rs apps/desktop/src-tauri/src/commands/knowledge.rs apps/desktop/src/lib/knowledge.ts apps/desktop/src/features/knowledge/KnowledgePage.tsx apps/desktop/src/features/knowledge/KnowledgeWorkbench.tsx apps/desktop/src/features/knowledge/LibraryExplorer.tsx apps/desktop/src/features/knowledge/KnowledgeSearchLab.tsx apps/desktop/src/features/knowledge/KnowledgeJobsPanel.tsx apps/desktop/src/features/knowledge/KnowledgeEnginePanel.tsx apps/desktop/src/features/knowledge/KnowledgePage.test.tsx
git commit -m "feat: redesign knowledge as split engine-aware workbench"
```

### Task 6: Restructure Agents and Settings around the new shell and inspector model

**Files:**
- Modify: `apps/desktop/src/features/agents/AgentsPage.tsx`
- Modify: `apps/desktop/src/features/agents/ToolBindingsPanel.tsx`
- Modify: `apps/desktop/src/features/agents/AgentsPage.test.tsx`
- Modify: `apps/desktop/src/features/settings/SettingsPage.tsx`
- Modify: `apps/desktop/src/features/settings/SettingsPage.test.tsx`
- Modify: `apps/desktop/src/components/ui/StatusBadge.tsx`
- Optional cleanup: `apps/desktop/src/components/ui/Card.tsx`
- Optional cleanup: `apps/desktop/src/components/ui/SectionHeader.tsx`

**Step 1: Write the failing tests**

Add tests that assert:

- Agents page renders a library/editor split rather than a generic card grid
- Settings page renders a real control-panel layout with section navigation and contextual guidance
- provider status still renders truthfully after the redesign

**Step 2: Run tests to verify they fail**

Run:

- `npm.cmd --prefix apps/desktop test -- src/features/agents/AgentsPage.test.tsx src/features/settings/SettingsPage.test.tsx`

Expected:

- FAIL because both pages still depend on the old shared card hierarchy.

**Step 3: Implement the minimal refactor**

Move Agents toward:

- asset list,
- editor surface,
- inspector detail.

Move Settings toward:

- left secondary nav,
- central control surface,
- contextual guide inspector.

Only keep `StatusBadge`, `Card`, or `SectionHeader` where they still serve a specific purpose. Do not let them shape the whole page layout.

**Step 4: Run tests to verify they pass**

Run:

- `npm.cmd --prefix apps/desktop test -- src/features/agents/AgentsPage.test.tsx src/features/settings/SettingsPage.test.tsx`

Expected: PASS

**Step 5: Commit**

```bash
git add apps/desktop/src/features/agents/AgentsPage.tsx apps/desktop/src/features/agents/ToolBindingsPanel.tsx apps/desktop/src/features/agents/AgentsPage.test.tsx apps/desktop/src/features/settings/SettingsPage.tsx apps/desktop/src/features/settings/SettingsPage.test.tsx apps/desktop/src/components/ui/StatusBadge.tsx apps/desktop/src/components/ui/Card.tsx apps/desktop/src/components/ui/SectionHeader.tsx
git commit -m "feat: align agents and settings with redesigned shell"
```

### Task 7: Add cross-page state handoff and navigation rules between Chat and Workflow

**Files:**
- Modify: `apps/desktop/src/App.tsx`
- Modify: `apps/desktop/src/components/shell/AppShell.tsx`
- Modify: `apps/desktop/src/lib/chat.ts`
- Modify: `apps/desktop/src/lib/workflow.ts`
- Modify: `apps/desktop/src/features/chat/ChatPage.tsx`
- Modify: `apps/desktop/src/features/workflow/WorkflowPage.tsx`
- Test: `apps/desktop/src/App.test.tsx`

**Step 1: Write the failing tests**

Add tests that assert:

- `Create workflow` in Chat can surface a transition into Workflow
- `Specific workflow` jumps into the workflow room after the first send
- active page and workflow session context stay synchronized

**Step 2: Run tests to verify they fail**

Run: `npm.cmd --prefix apps/desktop test -- src/App.test.tsx src/features/chat/ChatPage.test.tsx src/features/workflow/WorkflowPage.test.tsx`

Expected:

- FAIL because the current app keeps page navigation and feature state isolated.

**Step 3: Implement the minimal handoff**

Introduce an app-level navigation contract:

```ts
type AppIntent =
  | { kind: "open_chat" }
  | { kind: "open_workflow_lobby" }
  | { kind: "open_workflow_room"; workflowId: string; sessionId?: string };
```

Use that contract to hand off from Chat into Workflow cleanly without duplicating transcript state.

**Step 4: Run tests to verify they pass**

Run: `npm.cmd --prefix apps/desktop test -- src/App.test.tsx src/features/chat/ChatPage.test.tsx src/features/workflow/WorkflowPage.test.tsx`

Expected: PASS

**Step 5: Commit**

```bash
git add apps/desktop/src/App.tsx apps/desktop/src/components/shell/AppShell.tsx apps/desktop/src/lib/chat.ts apps/desktop/src/lib/workflow.ts apps/desktop/src/features/chat/ChatPage.tsx apps/desktop/src/features/workflow/WorkflowPage.tsx apps/desktop/src/App.test.tsx apps/desktop/src/features/chat/ChatPage.test.tsx apps/desktop/src/features/workflow/WorkflowPage.test.tsx
git commit -m "feat: add chat to workflow handoff model"
```

### Task 8: Verify the redesign end-to-end and update docs

**Files:**
- Modify: `README.md`
- Modify: `docs/plans/2026-03-09-desktop-frontend-redesign-design.md`
- Modify: `docs/plans/2026-03-09-desktop-frontend-redesign.md`

**Step 1: Run the frontend test suite**

Run: `npm.cmd --prefix apps/desktop test`

Expected: PASS

**Step 2: Run the Rust command and runtime tests**

Run: `cargo test --workspace`

Expected: PASS

**Step 3: Run the desktop build**

Run:

- `npm.cmd --prefix apps/desktop run build`

Expected: PASS

**Step 4: Update docs to match the final shipped behavior**

Update the README and the two plan files if file names, commands, or workflow terminology drifted during implementation.

**Step 5: Commit**

```bash
git add README.md docs/plans/2026-03-09-desktop-frontend-redesign-design.md docs/plans/2026-03-09-desktop-frontend-redesign.md
git commit -m "docs: finalize desktop frontend redesign plan and verification notes"
```

Plan complete and saved to `docs/plans/2026-03-09-desktop-frontend-redesign.md`. Two execution options:

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

Choose the parallel session path for a fresh implementation window if you want a clean execution handoff.
