# Desktop Frontend Restructure Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rebuild the desktop frontend around `Chat` as the default entry, a workflow explanation page instead of workflow workbenches, a `pageindex`-aware knowledge page, and compact support pages without persistent inspectors.

**Architecture:** Start by adding workflow explanation and revision contracts to the backend, then update the frontend data model and page state flow. Rebuild each page one-by-one with TDD, keeping layout changes incremental and anchored to real backend capability. Finish with Tauri MCP validation against real runtime states so the redesign is judged by the rendered app, not only by unit tests.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, Tauri 2, Rust, `@tauri-apps/api`, local CSS in `apps/desktop/src/styles/theme.css`, `pageindex` knowledge engine, Tauri MCP.

---

### Preflight: execution environment

**Files:**
- Reference: `docs/plans/2026-03-11-desktop-frontend-restructure-design.md`
- Reference: `apps/desktop/package.json`
- Reference: `apps/desktop/src-tauri/Cargo.toml`

**Step 1: Create a dedicated worktree before implementation**

Run:

```bash
git worktree add ..\nuka-world-desktop-restructure -b feat/desktop-frontend-restructure
```

Expected: A clean worktree exists at `..\nuka-world-desktop-restructure`.

**Step 2: Install frontend dependencies in the worktree**

Run:

```bash
cd ..\nuka-world-desktop-restructure\apps\desktop
npm install
```

Expected: `package-lock.json` remains stable or changes only if dependencies truly changed.

**Step 3: Confirm the current test baseline**

Run:

```bash
cd ..\nuka-world-desktop-restructure\apps\desktop
npm test
cd ..\..\apps\desktop\src-tauri
cargo test -p desktop-tauri
```

Expected: Capture the current pass/fail baseline before edits.

### Task 1: Add workflow explanation and revision backend contracts

**Files:**
- Modify: `crates/nuka-domain/src/workflow.rs`
- Modify: `crates/nuka-runtime/src/workflow.rs`
- Modify: `apps/desktop/src-tauri/src/commands/workflow.rs`
- Modify: `apps/desktop/src-tauri/src/commands/mod.rs`

**Step 1: Write the failing Rust tests for workflow explanation**

Add tests in `crates/nuka-runtime/src/workflow.rs` and `apps/desktop/src-tauri/src/commands/workflow.rs` that expect a readable explanation model and revision preview.

```rust
#[tokio::test]
async fn workflow_runtime_returns_readable_explanation() {
    let runtime = crate::workflow::WorkflowRuntime::new_for_test();
    let explanation = runtime.explain_template("workflow-release-notes").await.unwrap();

    assert_eq!(explanation.workflow_id, "workflow-release-notes");
    assert!(!explanation.steps.is_empty());
    assert!(explanation.steps[0].executor.len() > 0);
}

#[tokio::test]
async fn revise_workflow_returns_preview_without_overwriting_template() {
    let state = crate::bootstrap::build_app_state_for_test().await.unwrap();
    let preview = super::revise_workflow_inner(
        "workflow-release-notes".to_string(),
        "Search the knowledge base before drafting".to_string(),
        &state,
    ).await.unwrap();

    assert!(!preview.change_summary.is_empty());
    assert!(!preview.step_changes.is_empty());
}
```

**Step 2: Run the backend workflow tests to verify failure**

Run:

```bash
cargo test -p desktop-tauri workflow -- --nocapture
```

Expected: FAIL because the explanation and revision functions do not exist yet.

**Step 3: Implement the minimal backend contracts**

Add new workflow types in `crates/nuka-domain/src/workflow.rs` and expose Tauri commands in `apps/desktop/src-tauri/src/commands/workflow.rs`.

```rust
pub struct WorkflowExplanation {
    pub workflow_id: String,
    pub title: String,
    pub summary: String,
    pub steps: Vec<WorkflowExplanationStep>,
    pub dependencies: WorkflowDependencies,
}

pub struct WorkflowRevisionPreview {
    pub workflow_id: String,
    pub prompt: String,
    pub change_summary: String,
    pub step_changes: Vec<String>,
    pub dependency_changes: Vec<String>,
    pub outcome_changes: Vec<String>,
}
```

Implementation rules:

- explanation should be derived from saved workflow templates or runtime defaults, not hard-coded inside the page component
- revision preview can be deterministic and lightweight in phase one
- do not implement drag-and-drop or graph editing logic

**Step 4: Run the backend tests again**

Run:

```bash
cargo test -p desktop-tauri workflow -- --nocapture
```

Expected: PASS for the new workflow explanation and revision tests.

**Step 5: Commit**

```bash
git add crates/nuka-domain/src/workflow.rs crates/nuka-runtime/src/workflow.rs apps/desktop/src-tauri/src/commands/workflow.rs apps/desktop/src-tauri/src/commands/mod.rs
git commit -m "feat: add workflow explanation and revision contracts"
```

### Task 2: Update frontend workflow models and app-level workflow context

**Files:**
- Modify: `apps/desktop/src/lib/workflow.ts`
- Modify: `apps/desktop/src/App.tsx`
- Modify: `apps/desktop/src/App.test.tsx`

**Step 1: Write the failing frontend tests for workflow context handoff**

Add `App` tests that expect chat to remain the default page and allow workflow context attachment without turning the app into a workflow room.

```tsx
it("keeps chat as the default page and preserves a selected workflow token", async () => {
  const view = await renderIntoDocument(<App />);

  expect(view.container.textContent).toContain("Message World");
  expect(view.container.textContent).not.toContain("Workflow Room");
});
```

**Step 2: Run the app-level test**

Run:

```bash
cd apps/desktop
npm test -- src/App.test.tsx
```

Expected: FAIL once the test starts looking for the new chat-first contract.

**Step 3: Add workflow explanation, summary, revision, and current-context types**

Extend `apps/desktop/src/lib/workflow.ts` with:

```ts
export type WorkflowSummary = {
  id: string;
  title: string;
  summary: string;
};

export type WorkflowExplanation = {
  workflowId: string;
  title: string;
  summary: string;
  steps: Array<{
    id: string;
    title: string;
    purpose: string;
    executor: string;
    inputSource: string;
    output: string;
    completion: string;
  }>;
};
```

Also add app-level state for:

- selected workflow summary
- selected workflow id
- chat-side workflow token state

**Step 4: Re-run the app-level test**

Run:

```bash
cd apps/desktop
npm test -- src/App.test.tsx
```

Expected: PASS for chat-first routing and workflow context attachment.

**Step 5: Commit**

```bash
git add apps/desktop/src/lib/workflow.ts apps/desktop/src/App.tsx apps/desktop/src/App.test.tsx
git commit -m "feat: add app-level workflow context state"
```

### Task 3: Rebuild Chat around logo, composer, and `+` menu entry modes

**Files:**
- Modify: `apps/desktop/src/features/chat/ChatPage.tsx`
- Modify: `apps/desktop/src/features/chat/ChatPage.test.tsx`
- Modify: `apps/desktop/src/features/chat/SuggestionStrip.tsx`
- Modify: `apps/desktop/src/hooks/useProviderGate.ts`
- Modify: `apps/desktop/src/styles/theme.css`
- Optional cleanup: `apps/desktop/src/features/chat/ChatModeSwitcher.tsx`

**Step 1: Write failing chat tests for the new landing state**

Add or replace tests so they check for:

- logo and composer only on first load
- no radiogroup mode switcher
- no provider gate card
- no inspector text
- `+` menu reveals the three entry modes

```tsx
it("renders only logo and composer on first load", async () => {
  const view = await renderIntoDocument(<ChatPage />);

  expect(view.container.querySelector('[aria-label="World chat landing hero"]')).toBeTruthy();
  expect(view.container.querySelector("textarea")).toBeTruthy();
  expect(view.container.textContent).not.toContain("Provider required");
  expect(view.container.textContent).not.toContain("Context Inspector");
});

it("reveals entry modes from the plus menu", async () => {
  const view = await renderIntoDocument(<ChatPage />);
  await clickButton(view.container, "+");

  expect(view.container.textContent).toContain("Direct chat");
  expect(view.container.textContent).toContain("Choose workflow");
  expect(view.container.textContent).toContain("Create workflow");
});
```

**Step 2: Run the chat tests to verify failure**

Run:

```bash
cd apps/desktop
npm test -- src/features/chat/ChatPage.test.tsx
```

Expected: FAIL because the existing landing state still renders mode controls and provider blocks.

**Step 3: Implement the minimal chat redesign**

Refactor `ChatPage.tsx` so it:

- starts with logo and composer only
- moves mode selection behind a `+` popover or menu
- renders provider feedback inline near the composer instead of as a blocking card
- shows a lightweight workflow token after workflow attachment
- keeps session state in the same page after the first send

Use a helper structure like:

```tsx
type ComposerEntryMode = "direct" | "choose_workflow" | "create_workflow";

const [entryMenuOpen, setEntryMenuOpen] = useState(false);
const [entryMode, setEntryMode] = useState<ComposerEntryMode>("direct");
```

**Step 4: Re-run the chat tests**

Run:

```bash
cd apps/desktop
npm test -- src/features/chat/ChatPage.test.tsx
```

Expected: PASS for the new landing state and `+` menu behavior.

**Step 5: Commit**

```bash
git add apps/desktop/src/features/chat/ChatPage.tsx apps/desktop/src/features/chat/ChatPage.test.tsx apps/desktop/src/features/chat/SuggestionStrip.tsx apps/desktop/src/hooks/useProviderGate.ts apps/desktop/src/styles/theme.css
git commit -m "feat: redesign chat around logo and composer"
```

### Task 4: Rebuild Workflow as catalog plus explanation plus vibe revision

**Files:**
- Modify: `apps/desktop/src/features/workflow/WorkflowPage.tsx`
- Modify: `apps/desktop/src/features/workflow/WorkflowPage.test.tsx`
- Create: `apps/desktop/src/features/workflow/WorkflowCatalog.tsx`
- Create: `apps/desktop/src/features/workflow/WorkflowExplanationView.tsx`
- Create: `apps/desktop/src/features/workflow/WorkflowRevisionPanel.tsx`
- Optional cleanup: `apps/desktop/src/features/workflow/WorkflowLobby.tsx`
- Optional cleanup: `apps/desktop/src/features/workflow/WorkflowRoom.tsx`
- Optional cleanup: `apps/desktop/src/features/workflow/WorkflowTimeline.tsx`
- Modify: `apps/desktop/src/styles/theme.css`

**Step 1: Write failing workflow tests for the new page contract**

Replace workbench-oriented assertions with tests that expect:

- left list plus right detail
- no `Workflow Room`
- no `Workflow Context`
- explanation sections for overview, steps, dependencies
- vibe revision input and preview

```tsx
it("renders a workflow list and explanation view instead of a room workbench", async () => {
  const view = await renderIntoDocument(<WorkflowPage />);

  expect(view.container.textContent).toContain("Release Notes");
  expect(view.container.textContent).toContain("Enter chat");
  expect(view.container.textContent).not.toContain("Workflow Room");
  expect(view.container.textContent).not.toContain("Workflow Context");
});
```

**Step 2: Run the workflow tests to verify failure**

Run:

```bash
cd apps/desktop
npm test -- src/features/workflow/WorkflowPage.test.tsx
```

Expected: FAIL because the current page still renders the workflow lobby and room.

**Step 3: Implement the minimal workflow redesign**

Use the new backend contracts to build:

- a left workflow catalog
- a right explanation view
- a lightweight revision prompt and preview
- a direct `Enter chat` handoff back into app-level chat context

Use a page shape like:

```tsx
<div className="workflow-page">
  <WorkflowCatalog ... />
  <WorkflowExplanationView ... />
</div>
```

Implementation rules:

- no inspector
- no room metaphor
- no freeform graph editor
- revision preview must appear before applying the new version

**Step 4: Re-run the workflow tests**

Run:

```bash
cd apps/desktop
npm test -- src/features/workflow/WorkflowPage.test.tsx
```

Expected: PASS for catalog, explanation, and vibe preview behavior.

**Step 5: Commit**

```bash
git add apps/desktop/src/features/workflow/WorkflowPage.tsx apps/desktop/src/features/workflow/WorkflowPage.test.tsx apps/desktop/src/features/workflow/WorkflowCatalog.tsx apps/desktop/src/features/workflow/WorkflowExplanationView.tsx apps/desktop/src/features/workflow/WorkflowRevisionPanel.tsx apps/desktop/src/styles/theme.css
git commit -m "feat: redesign workflow as catalog and explanation"
```

### Task 5: Rebuild Settings as a compact directory

**Files:**
- Modify: `apps/desktop/src/features/settings/SettingsPage.tsx`
- Modify: `apps/desktop/src/features/settings/SettingsPage.test.tsx`
- Modify: `apps/desktop/src/styles/theme.css`

**Step 1: Write failing settings tests for compact navigation**

Add tests that expect:

- compact left navigation items
- sections `General`, `Providers`, `Appearance`, `Shortcuts`, `Runtime`
- no top-level runtime summary or large navigation cards
- a minimal shortcuts section

```tsx
it("renders compact settings sections including a minimal shortcuts panel", async () => {
  const view = await renderIntoDocument(<SettingsPage />);

  expect(view.container.textContent).toContain("General");
  expect(view.container.textContent).toContain("Shortcuts");
  expect(view.container.textContent).not.toContain("0 configured");
});
```

**Step 2: Run the settings tests to verify failure**

Run:

```bash
cd apps/desktop
npm test -- src/features/settings/SettingsPage.test.tsx
```

Expected: FAIL because the current page still uses oversized side cards and summary badges.

**Step 3: Implement the minimal settings restructure**

Refactor section definitions and layout so the page uses a compact directory rail and smaller grouped sections.

Add a `Shortcuts` section shape like:

```tsx
{
  id: "shortcuts",
  label: "Shortcuts",
  summary: "Common app shortcuts only.",
}
```

Keep first-pass shortcuts intentionally small:

- list common shortcuts
- optional global toggle
- restore defaults button

**Step 4: Re-run the settings tests**

Run:

```bash
cd apps/desktop
npm test -- src/features/settings/SettingsPage.test.tsx
```

Expected: PASS for compact navigation and small shortcuts scope.

**Step 5: Commit**

```bash
git add apps/desktop/src/features/settings/SettingsPage.tsx apps/desktop/src/features/settings/SettingsPage.test.tsx apps/desktop/src/styles/theme.css
git commit -m "feat: redesign settings as a compact directory"
```

### Task 6: Redesign Knowledge around `pageindex`

**Files:**
- Modify: `apps/desktop/src/features/knowledge/KnowledgePage.tsx`
- Modify: `apps/desktop/src/features/knowledge/KnowledgePage.test.tsx`
- Modify: `apps/desktop/src/features/knowledge/LibraryExplorer.tsx`
- Modify: `apps/desktop/src/features/knowledge/KnowledgeWorkbench.tsx`
- Modify: `apps/desktop/src/features/knowledge/KnowledgeSearchLab.tsx`
- Modify: `apps/desktop/src/features/knowledge/KnowledgeJobsPanel.tsx`
- Modify: `apps/desktop/src/features/knowledge/KnowledgeEnginePanel.tsx`
- Modify: `apps/desktop/src/styles/theme.css`

**Step 1: Write failing knowledge tests for the pageindex-first UI**

Add tests that expect:

- empty state: path input plus add action only
- populated state: search area plus source list
- search results show path and snippet
- jobs and engine details are not first-class tabs

```tsx
it("shows a path input first when no knowledge connector exists", async () => {
  resetMocks();
  seedLibrary({
    id: "library-1",
    name: "User Knowledge Base",
    description: "",
    engine: { id: "pageindex", label: "PageIndex", health: "healthy", capabilities: ["retrieval"] },
    connectors: [],
    supportedExtensions: ["md", "txt"],
  });

  const view = await renderIntoDocument(<KnowledgePage />);

  expect(view.container.querySelector('input[aria-label="Folder path"]')).toBeTruthy();
  expect(view.container.textContent).not.toContain("Jobs");
  expect(view.container.textContent).not.toContain("Engine Summary");
});
```

**Step 2: Run the knowledge tests to verify failure**

Run:

```bash
cd apps/desktop
npm test -- src/features/knowledge/KnowledgePage.test.tsx
```

Expected: FAIL because the current page still uses a multi-mode workbench.

**Step 3: Implement the minimal pageindex-driven redesign**

Shape the page around what `pageindex` actually does:

- local folder connectors
- rebuild index
- snippet-based retrieval

Implementation rules:

- empty state shows only add-source action
- populated state shows search plus sources
- search results emphasize snippet and normalized path
- rebuild feedback stays inline
- jobs and engine metadata move into secondary expandable sections

**Step 4: Re-run the knowledge tests**

Run:

```bash
cd apps/desktop
npm test -- src/features/knowledge/KnowledgePage.test.tsx
```

Expected: PASS for path-first empty state and pageindex-first populated layout.

**Step 5: Commit**

```bash
git add apps/desktop/src/features/knowledge/KnowledgePage.tsx apps/desktop/src/features/knowledge/KnowledgePage.test.tsx apps/desktop/src/features/knowledge/LibraryExplorer.tsx apps/desktop/src/features/knowledge/KnowledgeWorkbench.tsx apps/desktop/src/features/knowledge/KnowledgeSearchLab.tsx apps/desktop/src/features/knowledge/KnowledgeJobsPanel.tsx apps/desktop/src/features/knowledge/KnowledgeEnginePanel.tsx apps/desktop/src/styles/theme.css
git commit -m "feat: redesign knowledge around pageindex retrieval"
```

### Task 7: Simplify Agents into direct generation first, detail second

**Files:**
- Modify: `apps/desktop/src/features/agents/AgentsPage.tsx`
- Modify: `apps/desktop/src/features/agents/AgentsPage.test.tsx`
- Modify: `apps/desktop/src/features/agents/ToolBindingsPanel.tsx`
- Modify: `apps/desktop/src/styles/theme.css`

**Step 1: Write failing agents tests for the new page contract**

Add tests that expect:

- no inspector
- no library-plus-editor split when there are no agents
- direct generation input as the only first action

```tsx
it("shows only the generation surface when no agents exist", async () => {
  const view = await renderIntoDocument(<AgentsPage />);

  expect(view.container.textContent).toContain("Create");
  expect(view.container.textContent).not.toContain("Agent Details");
  expect(view.container.textContent).not.toContain("Agent Library");
});
```

**Step 2: Run the agents tests to verify failure**

Run:

```bash
cd apps/desktop
npm test -- src/features/agents/AgentsPage.test.tsx
```

Expected: FAIL because the current page still renders library, editor, and inspector together.

**Step 3: Implement the minimal agents redesign**

Rules:

- empty state: one-sentence prompt and create action
- populated state: left list plus right editable detail
- no duplicate right-side inspector

**Step 4: Re-run the agents tests**

Run:

```bash
cd apps/desktop
npm test -- src/features/agents/AgentsPage.test.tsx
```

Expected: PASS for direct-generation empty state and simplified detail view.

**Step 5: Commit**

```bash
git add apps/desktop/src/features/agents/AgentsPage.tsx apps/desktop/src/features/agents/AgentsPage.test.tsx apps/desktop/src/features/agents/ToolBindingsPanel.tsx apps/desktop/src/styles/theme.css
git commit -m "feat: simplify agents page flow"
```

### Task 8: Simplify Memory and remove permanent inspector scaffolding

**Files:**
- Modify: `apps/desktop/src/features/memory/MemoryPage.tsx`
- Modify: `apps/desktop/src/features/memory/MemoryPage.test.tsx`
- Modify: `apps/desktop/src/features/memory/MemoryNodeInspector.tsx`
- Modify: `apps/desktop/src/features/memory/MemoryGraphControls.tsx`
- Modify: `apps/desktop/src/components/shell/Inspector.tsx`
- Modify: `apps/desktop/src/styles/theme.css`

**Step 1: Write failing memory tests for the new empty and populated states**

Add tests that expect:

- no utilities rail on an empty graph
- no permanent node inspector
- graph canvas remains the primary content when nodes exist

```tsx
it("does not render graph utilities or node inspector when the graph is empty", async () => {
  const view = await renderIntoDocument(<MemoryPage />);

  expect(view.container.textContent).not.toContain("Graph Utilities");
  expect(view.container.textContent).not.toContain("Node Inspector");
});
```

**Step 2: Run the memory tests to verify failure**

Run:

```bash
cd apps/desktop
npm test -- src/features/memory/MemoryPage.test.tsx
```

Expected: FAIL because the current page still uses the three-column workbench.

**Step 3: Implement the minimal memory redesign**

Rules:

- empty state: one central graph entry surface only
- populated state: graph first, detail inline or temporary
- remove or deprecate permanent `Inspector` usage from memory

If `apps/desktop/src/components/shell/Inspector.tsx` becomes unused after page refactors, delete it in this task and remove the corresponding CSS.

**Step 4: Re-run the memory tests**

Run:

```bash
cd apps/desktop
npm test -- src/features/memory/MemoryPage.test.tsx
```

Expected: PASS for the stripped empty state and graph-first content layout.

**Step 5: Commit**

```bash
git add apps/desktop/src/features/memory/MemoryPage.tsx apps/desktop/src/features/memory/MemoryPage.test.tsx apps/desktop/src/features/memory/MemoryNodeInspector.tsx apps/desktop/src/features/memory/MemoryGraphControls.tsx apps/desktop/src/components/shell/Inspector.tsx apps/desktop/src/styles/theme.css
git commit -m "feat: simplify memory page layout"
```

### Task 9: Run the focused test suite and verify the real app with Tauri MCP

**Files:**
- Modify if needed: `docs/plans/2026-03-11-desktop-frontend-restructure-design.md`
- Create if needed: `docs/plans/2026-03-11-desktop-frontend-restructure-verification.md`

**Step 1: Run the focused frontend suite**

Run:

```bash
cd apps/desktop
npm test -- src/App.test.tsx
npm test -- src/features/chat/ChatPage.test.tsx
npm test -- src/features/workflow/WorkflowPage.test.tsx
npm test -- src/features/settings/SettingsPage.test.tsx
npm test -- src/features/knowledge/KnowledgePage.test.tsx
npm test -- src/features/agents/AgentsPage.test.tsx
npm test -- src/features/memory/MemoryPage.test.tsx
```

Expected: PASS for all targeted page tests.

**Step 2: Run the backend workflow and knowledge tests**

Run:

```bash
cargo test -p desktop-tauri workflow -- --nocapture
cargo test -p desktop-tauri knowledge -- --nocapture
```

Expected: PASS for workflow explanation/revision and pageindex-backed knowledge behavior.

**Step 3: Validate the real app using Tauri MCP**

Required checks:

- `Chat` first load with no provider
- `Chat` first load with provider
- `Chat` after selecting a workflow
- `Workflow` catalog and explanation view
- `Workflow` vibe revision preview
- `Settings` compact directory sections
- `Knowledge` with no connector
- `Knowledge` after adding a local connector and rebuilding pageindex
- `Agents` with no agents
- `Memory` with no nodes

Expected: The rendered app matches the design doc and shows no persistent right-side inspectors.

**Step 4: Record verification evidence**

If any real-app behavior differs from the design, document it immediately in:

```md
docs/plans/2026-03-11-desktop-frontend-restructure-verification.md
```

Minimum sections:

- environment
- commands run
- Tauri MCP observations
- screenshots or aria snapshot notes
- follow-up fixes if needed

**Step 5: Commit**

```bash
git add docs/plans/2026-03-11-desktop-frontend-restructure-verification.md
git commit -m "docs: record desktop frontend restructure verification"
```

### Task 10: Final full regression pass

**Files:**
- No code changes expected

**Step 1: Run the frontend suite**

Run:

```bash
cd apps/desktop
npm test
```

Expected: PASS.

**Step 2: Run the desktop backend suite**

Run:

```bash
cargo test -p desktop-tauri
```

Expected: PASS.

**Step 3: Build the desktop frontend**

Run:

```bash
cd apps/desktop
npm run build
```

Expected: PASS with no new TypeScript errors.

**Step 4: Smoke-run the Tauri app once more**

Run the desktop app in development mode and repeat the Tauri MCP checks for the final branch state.

Expected: The final rendered app matches the approved design.

**Step 5: Commit**

```bash
git status --short
```

Expected: clean or intentionally dirty only for files that are about to be reviewed.
