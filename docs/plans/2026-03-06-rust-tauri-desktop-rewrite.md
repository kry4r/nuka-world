# Rust/Tauri Desktop Rewrite Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rebuild Nuka World as a pure `Rust + Tauri 2 + React` desktop application with `World Chat` as the main entrypoint, reusable workflow templates, layered memory, user knowledge bases, and first-class tool integrations.

**Architecture:** Build a new Rust workspace and Tauri desktop app alongside the current repo contents, reach feature parity for the new desktop model, then remove the legacy Go/REST/web product surface. Keep the product local-first with SQLite, Stronghold, tray-resident runtime behavior, and Tauri command/event boundaries between UI and Rust core.

**Tech Stack:** Rust workspace, Tauri 2, React, TypeScript, Vite, SQLite, Stronghold, Vitest/Playwright, cargo test, npm scripts.

---

### Task 1: Create the new Rust/Tauri workspace skeleton

**Files:**
- Create: `Cargo.toml`
- Create: `apps/desktop/package.json`
- Create: `apps/desktop/tsconfig.json`
- Create: `apps/desktop/vite.config.ts`
- Create: `apps/desktop/src/main.tsx`
- Create: `apps/desktop/src/App.tsx`
- Create: `apps/desktop/src-tauri/Cargo.toml`
- Create: `apps/desktop/src-tauri/src/main.rs`
- Create: `apps/desktop/src-tauri/src/lib.rs`
- Create: `apps/desktop/src-tauri/tauri.conf.json`
- Modify: `README.md`

**Step 1: Write the failing workspace smoke tests**

```rust
// apps/desktop/src-tauri/src/lib.rs
#[cfg(test)]
mod tests {
    #[test]
    fn desktop_workspace_bootstrap_placeholder() {
        assert!(std::path::Path::new("../../package.json").exists());
    }
}
```

**Step 2: Run test to verify it fails**

Run: `cargo test -p desktop-tauri bootstrap_placeholder -- --nocapture`
Expected: FAIL because the workspace/package files do not exist yet.

**Step 3: Write minimal implementation**

```toml
# Cargo.toml
[workspace]
members = [
  "apps/desktop/src-tauri",
  "crates/nuka-domain",
  "crates/nuka-runtime",
  "crates/nuka-storage",
  "crates/nuka-tools",
  "crates/nuka-integrations",
  "crates/nuka-memory",
  "crates/nuka-knowledge",
]
resolver = "2"
```

```rust
// apps/desktop/src-tauri/src/main.rs
fn main() {
    desktop_tauri::run();
}
```

```rust
// apps/desktop/src-tauri/src/lib.rs
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("failed to run tauri app");
}
```

**Step 4: Run tests to verify they pass**

Run: `cargo test -p desktop-tauri -- --nocapture`
Expected: PASS

**Step 5: Commit**

```bash
git add Cargo.toml README.md apps/desktop
git commit -m "feat: scaffold rust tauri desktop workspace"
```

### Task 2: Add the shared domain crate

**Files:**
- Create: `crates/nuka-domain/Cargo.toml`
- Create: `crates/nuka-domain/src/lib.rs`
- Create: `crates/nuka-domain/src/workflow.rs`
- Create: `crates/nuka-domain/src/agent.rs`
- Create: `crates/nuka-domain/src/tool.rs`
- Create: `crates/nuka-domain/src/memory.rs`
- Create: `crates/nuka-domain/src/knowledge.rs`
- Test: `crates/nuka-domain/src/lib.rs`

**Step 1: Write the failing domain tests**

```rust
#[cfg(test)]
mod tests {
    use crate::workflow::{WorkflowTemplate, WorkflowVisibility};

    #[test]
    fn saved_workflow_defaults_to_private_visibility() {
        let workflow = WorkflowTemplate::saved("code-review");
        assert_eq!(workflow.visibility, WorkflowVisibility::Private);
    }
}
```

**Step 2: Run test to verify it fails**

Run: `cargo test -p nuka-domain saved_workflow_defaults_to_private_visibility`
Expected: FAIL because the workflow types do not exist.

**Step 3: Write minimal implementation**

```rust
// crates/nuka-domain/src/workflow.rs
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum WorkflowVisibility {
    Private,
    Shared,
}

#[derive(Debug, Clone)]
pub struct WorkflowTemplate {
    pub id: String,
    pub name: String,
    pub saved: bool,
    pub visibility: WorkflowVisibility,
}

impl WorkflowTemplate {
    pub fn saved(name: impl Into<String>) -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            name: name.into(),
            saved: true,
            visibility: WorkflowVisibility::Private,
        }
    }
}
```

**Step 4: Run tests to verify they pass**

Run: `cargo test -p nuka-domain`
Expected: PASS

**Step 5: Commit**

```bash
git add crates/nuka-domain
git commit -m "feat: add shared domain model crate"
```

### Task 3: Add storage with SQLite migrations and repositories

**Files:**
- Create: `crates/nuka-storage/Cargo.toml`
- Create: `crates/nuka-storage/src/lib.rs`
- Create: `crates/nuka-storage/src/db.rs`
- Create: `crates/nuka-storage/src/migrations.rs`
- Create: `crates/nuka-storage/src/workflows.rs`
- Create: `crates/nuka-storage/src/sessions.rs`
- Create: `crates/nuka-storage/src/tools.rs`
- Create: `crates/nuka-storage/src/memory.rs`
- Create: `crates/nuka-storage/migrations/0001_initial.sql`
- Test: `crates/nuka-storage/src/lib.rs`

**Step 1: Write the failing repository test**

```rust
#[tokio::test]
async fn creates_and_reads_workflow_template() {
    let db = crate::db::open_in_memory().await.unwrap();
    crate::migrations::run(&db).await.unwrap();

    let repo = crate::workflows::WorkflowRepository::new(db.clone());
    repo.insert_template("engineering-room").await.unwrap();

    let items = repo.list_templates().await.unwrap();
    assert_eq!(items.len(), 1);
}
```

**Step 2: Run test to verify it fails**

Run: `cargo test -p nuka-storage creates_and_reads_workflow_template`
Expected: FAIL because storage modules do not exist.

**Step 3: Write minimal implementation**

```sql
-- crates/nuka-storage/migrations/0001_initial.sql
create table workflows (
  id text primary key,
  name text not null,
  saved integer not null,
  created_at text not null
);
```

```rust
// crates/nuka-storage/src/workflows.rs
pub struct WorkflowRepository {
    pool: sqlx::SqlitePool,
}

impl WorkflowRepository {
    pub fn new(pool: sqlx::SqlitePool) -> Self { Self { pool } }

    pub async fn insert_template(&self, name: &str) -> anyhow::Result<()> {
        sqlx::query("insert into workflows (id, name, saved, created_at) values (?1, ?2, 1, datetime('now'))")
            .bind(uuid::Uuid::new_v4().to_string())
            .bind(name)
            .execute(&self.pool)
            .await?;
        Ok(())
    }
}
```

**Step 4: Run tests to verify they pass**

Run: `cargo test -p nuka-storage`
Expected: PASS

**Step 5: Commit**

```bash
git add crates/nuka-storage
git commit -m "feat: add sqlite repositories and migrations"
```

### Task 4: Implement app runtime, tray behavior, and settings boot

**Files:**
- Modify: `apps/desktop/src-tauri/src/lib.rs`
- Create: `apps/desktop/src-tauri/src/app_state.rs`
- Create: `apps/desktop/src-tauri/src/tray.rs`
- Create: `apps/desktop/src-tauri/src/settings.rs`
- Create: `apps/desktop/src-tauri/src/commands/app.rs`
- Test: `apps/desktop/src-tauri/src/tray.rs`

**Step 1: Write the failing tray policy test**

```rust
#[test]
fn close_window_policy_minimizes_to_tray() {
    let policy = crate::tray::ClosePolicy::default();
    assert!(policy.minimize_to_tray);
}
```

**Step 2: Run test to verify it fails**

Run: `cargo test -p desktop-tauri close_window_policy_minimizes_to_tray`
Expected: FAIL because tray policy is not implemented.

**Step 3: Write minimal implementation**

```rust
// apps/desktop/src-tauri/src/tray.rs
#[derive(Debug, Clone)]
pub struct ClosePolicy {
    pub minimize_to_tray: bool,
}

impl Default for ClosePolicy {
    fn default() -> Self {
        Self { minimize_to_tray: true }
    }
}
```

```rust
// apps/desktop/src-tauri/src/lib.rs
mod tray;
mod app_state;
mod settings;

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            crate::tray::install(app)?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("failed to run tauri app");
}
```

**Step 4: Run tests to verify they pass**

Run: `cargo test -p desktop-tauri`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/desktop/src-tauri/src
git commit -m "feat: add tray-resident desktop runtime"
```

### Task 5: Implement World Chat sessions and command/event boundary

**Files:**
- Create: `crates/nuka-runtime/Cargo.toml`
- Create: `crates/nuka-runtime/src/lib.rs`
- Create: `crates/nuka-runtime/src/world.rs`
- Create: `crates/nuka-runtime/src/session.rs`
- Create: `apps/desktop/src-tauri/src/commands/chat.rs`
- Create: `apps/desktop/src/lib/chat.ts`
- Create: `apps/desktop/src/features/chat/ChatPage.tsx`
- Test: `crates/nuka-runtime/src/world.rs`

**Step 1: Write the failing world routing test**

```rust
#[tokio::test]
async fn world_routes_simple_prompts_to_direct_reply() {
    let runtime = crate::world::WorldRuntime::new_for_test();
    let result = runtime.route_prompt("summarize today's notes").await.unwrap();
    assert!(matches!(result, crate::world::WorldRoute::DirectReply));
}
```

**Step 2: Run test to verify it fails**

Run: `cargo test -p nuka-runtime world_routes_simple_prompts_to_direct_reply`
Expected: FAIL because the world runtime does not exist.

**Step 3: Write minimal implementation**

```rust
// crates/nuka-runtime/src/world.rs
pub enum WorldRoute {
    DirectReply,
    ExistingWorkflow(String),
    NewWorkflow,
}

pub struct WorldRuntime;

impl WorldRuntime {
    pub fn new_for_test() -> Self { Self }

    pub async fn route_prompt(&self, prompt: &str) -> anyhow::Result<WorldRoute> {
        if prompt.contains("workflow") {
            Ok(WorldRoute::NewWorkflow)
        } else {
            Ok(WorldRoute::DirectReply)
        }
    }
}
```

**Step 4: Run tests to verify they pass**

Run: `cargo test -p nuka-runtime`
Expected: PASS

**Step 5: Commit**

```bash
git add crates/nuka-runtime apps/desktop/src/features/chat apps/desktop/src-tauri/src/commands/chat.rs apps/desktop/src/lib/chat.ts
git commit -m "feat: add world chat runtime and tauri boundary"
```

### Task 6: Implement workflow templates, workflow sessions, and workflow-world coordination

**Files:**
- Modify: `crates/nuka-domain/src/workflow.rs`
- Create: `crates/nuka-runtime/src/workflow.rs`
- Create: `crates/nuka-runtime/src/workflow_world.rs`
- Create: `apps/desktop/src-tauri/src/commands/workflow.rs`
- Create: `apps/desktop/src/features/workflow/WorkflowPage.tsx`
- Create: `apps/desktop/src/features/workflow/AgentColumn.tsx`
- Test: `crates/nuka-runtime/src/workflow.rs`

**Step 1: Write the failing workflow session test**

```rust
#[tokio::test]
async fn starting_saved_workflow_creates_fresh_session() {
    let runtime = crate::workflow::WorkflowRuntime::new_for_test();
    let first = runtime.start_session("workflow-1").await.unwrap();
    let second = runtime.start_session("workflow-1").await.unwrap();
    assert_ne!(first.id, second.id);
}
```

**Step 2: Run test to verify it fails**

Run: `cargo test -p nuka-runtime starting_saved_workflow_creates_fresh_session`
Expected: FAIL because workflow runtime does not exist.

**Step 3: Write minimal implementation**

```rust
// crates/nuka-runtime/src/workflow.rs
pub struct WorkflowSession {
    pub id: String,
    pub workflow_id: String,
}

pub struct WorkflowRuntime;

impl WorkflowRuntime {
    pub fn new_for_test() -> Self { Self }

    pub async fn start_session(&self, workflow_id: &str) -> anyhow::Result<WorkflowSession> {
        Ok(WorkflowSession {
            id: uuid::Uuid::new_v4().to_string(),
            workflow_id: workflow_id.to_string(),
        })
    }
}
```

**Step 4: Run tests to verify they pass**

Run: `cargo test -p nuka-runtime`
Expected: PASS

**Step 5: Commit**

```bash
git add crates/nuka-runtime apps/desktop/src/features/workflow apps/desktop/src-tauri/src/commands/workflow.rs
git commit -m "feat: add reusable workflow templates and sessions"
```

### Task 7: Implement agent presets and unified tools library

**Files:**
- Modify: `crates/nuka-domain/src/agent.rs`
- Modify: `crates/nuka-domain/src/tool.rs`
- Create: `crates/nuka-tools/Cargo.toml`
- Create: `crates/nuka-tools/src/lib.rs`
- Create: `crates/nuka-tools/src/registry.rs`
- Create: `apps/desktop/src-tauri/src/commands/agents.rs`
- Create: `apps/desktop/src/features/agents/AgentsPage.tsx`
- Create: `apps/desktop/src/features/agents/ToolBindingsPanel.tsx`
- Test: `crates/nuka-tools/src/registry.rs`

**Step 1: Write the failing tool binding test**

```rust
#[test]
fn agent_can_bind_multiple_tools() {
    let bindings = crate::registry::ToolBindingSet::from_names(["codex", "git", "search_knowledge"]);
    assert_eq!(bindings.len(), 3);
}
```

**Step 2: Run test to verify it fails**

Run: `cargo test -p nuka-tools agent_can_bind_multiple_tools`
Expected: FAIL because the tools registry does not exist.

**Step 3: Write minimal implementation**

```rust
// crates/nuka-tools/src/registry.rs
pub struct ToolBindingSet(Vec<String>);

impl ToolBindingSet {
    pub fn from_names<const N: usize>(names: [&str; N]) -> Self {
        Self(names.into_iter().map(|name| name.to_string()).collect())
    }

    pub fn len(&self) -> usize {
        self.0.len()
    }
}
```

**Step 4: Run tests to verify they pass**

Run: `cargo test -p nuka-tools`
Expected: PASS

**Step 5: Commit**

```bash
git add crates/nuka-tools apps/desktop/src/features/agents apps/desktop/src-tauri/src/commands/agents.rs
 git commit -m "feat: add agent presets and tool bindings"
```

**Implementation notes (2026-03-07):**
- Make the `Agents` page lead with one-sentence quick-create rather than a preset grid alone.
- Natural-language agent creation should draft role, provider profile, tool bindings, memory scope, and knowledge access before save.
- Keep the preset library as a secondary surface below the quick-create flow.

### Task 8: Add integrated coding tool runtime for Codex and Claude Code

**Files:**
- Modify: `crates/nuka-domain/src/tool.rs`
- Create: `crates/nuka-tools/src/integrated.rs`
- Create: `crates/nuka-tools/src/codex.rs`
- Create: `crates/nuka-tools/src/claude_code.rs`
- Create: `apps/desktop/src-tauri/src/commands/tools.rs`
- Create: `apps/desktop/src/features/tools/IntegratedToolSessionCard.tsx`
- Create: `apps/desktop/src/features/tools/ToolInvocationPanel.tsx`
- Test: `crates/nuka-tools/src/integrated.rs`

**Step 1: Write the failing integrated-output policy test**

```rust
#[test]
fn integrated_tool_output_defaults_to_session_scope() {
    let policy = crate::integrated::OutputPolicy::default();
    assert_eq!(policy.target_scope, crate::integrated::OutputScope::SessionArtifacts);
}
```

**Step 2: Run test to verify it fails**

Run: `cargo test -p nuka-tools integrated_tool_output_defaults_to_session_scope`
Expected: FAIL because integrated tool policies do not exist.

**Step 3: Write minimal implementation**

```rust
// crates/nuka-tools/src/integrated.rs
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum OutputScope {
    SessionArtifacts,
    WorkflowMemory,
    KnowledgeBase,
}

#[derive(Debug, Clone)]
pub struct OutputPolicy {
    pub target_scope: OutputScope,
}

impl Default for OutputPolicy {
    fn default() -> Self {
        Self { target_scope: OutputScope::SessionArtifacts }
    }
}
```

**Step 4: Run tests to verify they pass**

Run: `cargo test -p nuka-tools`
Expected: PASS

**Step 5: Commit**

```bash
git add crates/nuka-tools apps/desktop/src/features/tools apps/desktop/src-tauri/src/commands/tools.rs
git commit -m "feat: add integrated coding tool runtime"
```

### Task 9: Implement layered memory and user knowledge base

**Files:**
- Create: `crates/nuka-memory/Cargo.toml`
- Create: `crates/nuka-memory/src/lib.rs`
- Create: `crates/nuka-memory/src/layers.rs`
- Create: `crates/nuka-memory/src/promote.rs`
- Create: `crates/nuka-knowledge/Cargo.toml`
- Create: `crates/nuka-knowledge/src/lib.rs`
- Create: `crates/nuka-knowledge/src/library.rs`
- Create: `crates/nuka-knowledge/src/import.rs`
- Create: `apps/desktop/src-tauri/src/commands/memory.rs`
- Create: `apps/desktop/src-tauri/src/commands/knowledge.rs`
- Create: `apps/desktop/src/features/memory/MemoryPage.tsx`
- Create: `apps/desktop/src/features/knowledge/KnowledgePage.tsx`
- Test: `crates/nuka-memory/src/layers.rs`
- Test: `crates/nuka-knowledge/src/library.rs`

**Step 1: Write the failing memory promotion test**

```rust
#[test]
fn saved_workflow_can_promote_session_memory_to_shared_memory() {
    let result = crate::promote::can_promote_to_workflow_shared(true);
    assert!(result);
}
```

**Step 2: Run test to verify it fails**

Run: `cargo test -p nuka-memory saved_workflow_can_promote_session_memory_to_shared_memory`
Expected: FAIL because memory promotion logic does not exist.

**Step 3: Write minimal implementation**

```rust
// crates/nuka-memory/src/promote.rs
pub fn can_promote_to_workflow_shared(is_saved_workflow: bool) -> bool {
    is_saved_workflow
}
```

```rust
// crates/nuka-knowledge/src/library.rs
pub struct KnowledgeLibrary {
    pub id: String,
    pub name: String,
}
```

**Step 4: Run tests to verify they pass**

Run: `cargo test -p nuka-memory && cargo test -p nuka-knowledge`
Expected: PASS

**Step 5: Commit**

```bash
git add crates/nuka-memory crates/nuka-knowledge apps/desktop/src/features/memory apps/desktop/src/features/knowledge apps/desktop/src-tauri/src/commands/memory.rs apps/desktop/src-tauri/src/commands/knowledge.rs
git commit -m "feat: add layered memory and knowledge base"
```

**Implementation notes (2026-03-07):**
- Treat `Memory` as graph-first UI with layer switching, subject switching, and a node inspector.
- Model `Knowledge` as connector-first ingestion into a normalized local hierarchy: `Library -> Collection -> Item -> Chunk`.
- Recommended connector starting set: GitHub, Notion, Web Docs, and Local Vaults, ideally via official or source-native adapters such as `octokit` and `@notionhq/client`.
- Recommended local retrieval layer: keep sync metadata in `SQLite`, and store chunk/index data in embedded `LanceDB` rather than depending on a hosted external knowledge store.
- For web docs crawling and heavier normalization, use tools such as `Firecrawl` or `Unstructured` at the ingestion boundary, not as the core desktop runtime.
- Use frameworks like `LlamaIndex` as reference patterns or optional workers, not as the core desktop runtime dependency.

### Task 10: Add provider integrations plus Slack and Discord runtime adapters

**Files:**
- Create: `crates/nuka-integrations/Cargo.toml`
- Create: `crates/nuka-integrations/src/lib.rs`
- Create: `crates/nuka-integrations/src/providers/mod.rs`
- Create: `crates/nuka-integrations/src/providers/openai.rs`
- Create: `crates/nuka-integrations/src/providers/anthropic.rs`
- Create: `crates/nuka-integrations/src/slack.rs`
- Create: `crates/nuka-integrations/src/discord.rs`
- Create: `apps/desktop/src-tauri/src/commands/providers.rs`
- Create: `apps/desktop/src/features/settings/SettingsPage.tsx`
- Test: `crates/nuka-integrations/src/providers/mod.rs`

**Step 1: Write the failing provider registry test**

```rust
#[test]
fn provider_registry_starts_empty() {
    let registry = crate::providers::ProviderRegistry::default();
    assert_eq!(registry.len(), 0);
}
```

**Step 2: Run test to verify it fails**

Run: `cargo test -p nuka-integrations provider_registry_starts_empty`
Expected: FAIL because the integrations crate does not exist.

**Step 3: Write minimal implementation**

```rust
// crates/nuka-integrations/src/providers/mod.rs
#[derive(Default)]
pub struct ProviderRegistry(Vec<String>);

impl ProviderRegistry {
    pub fn len(&self) -> usize {
        self.0.len()
    }
}
```

**Step 4: Run tests to verify they pass**

Run: `cargo test -p nuka-integrations`
Expected: PASS

**Step 5: Commit**

```bash
git add crates/nuka-integrations apps/desktop/src/features/settings apps/desktop/src-tauri/src/commands/providers.rs
git commit -m "feat: add provider and remote integration runtime"
```

**Implementation notes (2026-03-07):**
- Provider and model management lives inside `Settings`; do not keep a standalone `Providers` page in the shell.
- `commands/providers.rs` remains the shared backend boundary for settings, chat, agents, workflows, and knowledge ingestion.
- Slack and Discord adapters should consume the same provider registry instead of a parallel configuration surface.

### Task 11: Build the design system and shell UI before detailed screens

**Files:**
- Create: `apps/desktop/src/styles/tokens.css`
- Create: `apps/desktop/src/styles/theme.css`
- Create: `apps/desktop/src/components/shell/AppShell.tsx`
- Create: `apps/desktop/src/components/shell/Sidebar.tsx`
- Create: `apps/desktop/src/components/shell/Inspector.tsx`
- Create: `apps/desktop/src/components/ui/Card.tsx`
- Create: `apps/desktop/src/components/ui/StatusBadge.tsx`
- Create: `apps/desktop/src/components/ui/SectionHeader.tsx`
- Modify: `apps/desktop/src/App.tsx`
- Modify: `docs/plans/2026-03-06-rust-tauri-desktop-rewrite-design.md`

**Step 1: Write the failing shell render test**

```tsx
import { render, screen } from "@testing-library/react";
import { AppShell } from "@/components/shell/AppShell";

it("renders primary navigation", () => {
  render(<AppShell />);
  expect(screen.getByText("Chat")).toBeInTheDocument();
  expect(screen.getByText("Workflow")).toBeInTheDocument();
});
```

**Step 2: Run test to verify it fails**

Run: `npm --prefix apps/desktop test -- AppShell`
Expected: FAIL because the shell components do not exist.

**Step 3: Write minimal implementation**

```tsx
// apps/desktop/src/components/shell/AppShell.tsx
export function AppShell() {
  return (
    <div className="app-shell">
      <aside>
        <nav>Chat Workflow Agents Memory Knowledge</nav>
        <footer>Settings</footer>
      </aside>
      <main />
      <section />
    </div>
  );
}
```

```css
/* apps/desktop/src/styles/tokens.css */
:root {
  --color-primary: #7da05a;
  --color-bg: #f8f4ea;
  --color-panel: #fffdf8;
  --color-text: #304034;
}
```

**Step 4: Run tests to verify they pass**

Run: `npm --prefix apps/desktop test`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/desktop/src/components apps/desktop/src/styles apps/desktop/src/App.tsx docs/plans/2026-03-06-rust-tauri-desktop-rewrite-design.md
git commit -m "feat: add desktop shell design system"
```

**Implementation notes (2026-03-07):**
- The shell navigation should expose `Chat`, `Workflow`, `Agents`, `Memory`, and `Knowledge` as primary entries.
- `Settings` should sit as the single bottom utility entry and own provider management, app behavior, and runtime preferences.
- The detailed screens should match the approved warm-cream desktop design in `docs/design.pen`, especially the quick-create `Agents` page, graph-first `Memory` page, and connector-first `Knowledge` page.

### Task 12: Remove legacy Go/REST/web product surfaces after parity

**Files:**
- Delete: `cmd/`
- Delete: `internal/`
- Delete: `web/`
- Delete: `go.mod`
- Delete: `go.sum`
- Delete: `Dockerfile`
- Delete: `docker-compose.yml`
- Modify: `README.md`
- Modify: `.gitignore`

**Step 1: Write the failing repo policy test**

```bash
rg -n "NEXT_PUBLIC_API_URL|http://localhost:8080/api|package main" .
```

Expected: FAIL because legacy Go/REST/web strings still exist.

**Step 2: Run checks to verify failure**

Run: `rg -n "NEXT_PUBLIC_API_URL|http://localhost:8080/api|package main" .`
Expected: matches in `web/`, `cmd/`, and Go sources.

**Step 3: Perform minimal cleanup**

```markdown
- remove Go entrypoints and runtime packages
- remove Next.js web product surface
- rewrite README for Rust/Tauri desktop setup only
```

**Step 4: Run checks to verify cleanup**

Run: `rg -n "NEXT_PUBLIC_API_URL|http://localhost:8080/api|package main" .`
Expected: no matches in tracked source files.

Run: `cargo test --workspace && npm --prefix apps/desktop test`
Expected: PASS

**Step 5: Commit**

```bash
git add -A
git commit -m "refactor: remove legacy go and web stacks"
```

## Notes for Execution

- Implement the shell and design tokens before polishing feature screens.
- Keep the default output policy for integrated coding tools scoped to the current workflow session.
- Do not let users chat directly with workflow agents; only `World` and `Workflow World` can speak back to the user.
- Save workflow shared memory only for saved workflows.
- Prefer small, vertical slices with tests at each boundary.

## Suggested Skill Usage During Execution

- Use `superpowers:subagent-driven-development` if executing in this session.
- Use `superpowers:executing-plans` if executing in a fresh session.
- Use `superpowers:test-driven-development` before each feature slice.
- Use `superpowers:systematic-debugging` for runtime or integration failures.
- Use `superpowers:verification-before-completion` before claiming parity.
