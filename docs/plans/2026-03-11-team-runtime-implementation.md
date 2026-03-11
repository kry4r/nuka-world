# Team Runtime Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the static workflow facade with a real provider-backed Team and TeamRun system, add multi-session Chat tabs, and expose explicit agent tool bindings and tool activity end-to-end.

**Architecture:** Build the feature from the backend outward. First add durable domain and storage models, then wire real OpenAI-compatible completions into chat, team generation, and team-run coordination, then expose new Tauri commands, and only then switch the React app from workflow-oriented assumptions to Team and TeamRun data. Keep changes incremental, preserve direct chat behavior, and remove the legacy workflow-only surface only after Team and Chat are green.

**Tech Stack:** Rust, Tauri 2, React 19, TypeScript, Vitest, SQLx with SQLite, reqwest, OpenAI-compatible chat completions, existing `nuka-tools` and MCP bridge plumbing.

Use `@superpowers:test-driven-development` on every task. Use `@superpowers:verification-before-completion` before claiming the feature is done.

---

### Task 1: Add Team Domain Models And Rich Tool Bindings

**Files:**
- Create: `crates/nuka-domain/src/team.rs`
- Modify: `crates/nuka-domain/src/lib.rs`
- Modify: `crates/nuka-domain/src/tool.rs`
- Test: `crates/nuka-domain/src/lib.rs`

**Step 1: Write the failing test**

```rust
#[test]
fn team_defaults_to_ready_with_budget_defaults() {
    let team = crate::team::Team::new("team-release", "Release Team", "Ship the release cleanly");
    assert_eq!(team.status, crate::team::TeamStatus::Ready);
    assert!(team.agents.is_empty());

    let charter = crate::team::RunCharter::default_for_goal("Ship the release cleanly");
    assert_eq!(charter.max_active_agents_per_round, 3);
    assert_eq!(charter.max_messages_per_agent_per_round, 2);
}

#[test]
fn agent_tool_binding_carries_adapter_and_cost_metadata() {
    let binding = crate::tool::AgentToolBinding::allowed_cli("cli:git-read", "Inspect repo state");
    assert_eq!(binding.tool_id, "cli:git-read");
    assert_eq!(binding.adapter_kind, crate::tool::ToolAdapterKind::Cli);
    assert_eq!(binding.cost_class, crate::tool::ToolCostClass::Medium);
}
```

**Step 2: Run test to verify it fails**

Run: `cargo test -p nuka-domain team_defaults_to_ready_with_budget_defaults -- --nocapture`

Expected: FAIL with missing `team` module and missing `allowed_cli` constructor.

**Step 3: Write minimal implementation**

```rust
// crates/nuka-domain/src/team.rs
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TeamStatus {
    Ready,
    Archived,
    Deleted,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RunCharter {
    pub goal: String,
    pub max_active_agents_per_round: usize,
    pub max_messages_per_agent_per_round: usize,
}

impl RunCharter {
    pub fn default_for_goal(goal: impl Into<String>) -> Self {
        Self {
            goal: goal.into(),
            max_active_agents_per_round: 3,
            max_messages_per_agent_per_round: 2,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Team {
    pub id: String,
    pub name: String,
    pub goal: String,
    pub status: TeamStatus,
    pub agents: Vec<TeamAgent>,
}
```

```rust
// crates/nuka-domain/src/tool.rs
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ToolAdapterKind {
    Mcp,
    Cli,
    IntegratedAgent,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ToolCostClass {
    Low,
    Medium,
    High,
}

impl AgentToolBinding {
    pub fn allowed_cli(tool_id: impl Into<String>, purpose: impl Into<String>) -> Self {
        Self {
            tool_id: tool_id.into(),
            allowed: true,
            adapter_kind: ToolAdapterKind::Cli,
            purpose: purpose.into(),
            cost_class: ToolCostClass::Medium,
        }
    }
}
```

**Step 4: Run test to verify it passes**

Run: `cargo test -p nuka-domain team_defaults_to_ready_with_budget_defaults agent_tool_binding_carries_adapter_and_cost_metadata -- --nocapture`

Expected: PASS for both new tests.

**Step 5: Commit**

```bash
git add crates/nuka-domain/src/team.rs crates/nuka-domain/src/lib.rs crates/nuka-domain/src/tool.rs
git commit -m "feat: add team domain models"
```

### Task 2: Add Team And TeamRun Storage Tables And Repositories

**Files:**
- Modify: `crates/nuka-storage/migrations/0001_initial.sql`
- Create: `crates/nuka-storage/src/teams.rs`
- Create: `crates/nuka-storage/src/team_runs.rs`
- Modify: `crates/nuka-storage/src/lib.rs`
- Test: `crates/nuka-storage/src/lib.rs`

**Step 1: Write the failing test**

```rust
#[tokio::test]
async fn saves_and_reads_team_definitions_and_agents() {
    let db = crate::db::open_in_memory().await.unwrap();
    crate::migrations::run(&db).await.unwrap();

    let repo = crate::teams::TeamRepository::new(db.clone());
    repo.save_team(sample_team()).await.unwrap();

    let teams = repo.list_teams().await.unwrap();
    assert_eq!(teams.len(), 1);
    assert_eq!(teams[0].agents.len(), 2);
}

#[tokio::test]
async fn saves_and_reads_team_run_snapshot_and_events() {
    let db = crate::db::open_in_memory().await.unwrap();
    crate::migrations::run(&db).await.unwrap();

    let repo = crate::team_runs::TeamRunRepository::new(db.clone());
    repo.create_run(sample_run()).await.unwrap();

    let loaded = repo.load_run("run-release").await.unwrap().unwrap();
    assert_eq!(loaded.agents.len(), 2);
    assert!(!loaded.events.is_empty());
}
```

**Step 2: Run test to verify it fails**

Run: `cargo test -p nuka-storage saves_and_reads_team_definitions_and_agents -- --nocapture`

Expected: FAIL with unresolved `teams` or missing `team_runs` tables.

**Step 3: Write minimal implementation**

```rust
// crates/nuka-storage/src/teams.rs
pub struct TeamRepository {
    pool: sqlx::SqlitePool,
}

impl TeamRepository {
    pub fn new(pool: sqlx::SqlitePool) -> Self { Self { pool } }
    pub async fn save_team(&self, team: nuka_domain::team::Team) -> anyhow::Result<()> { /* upsert */ }
    pub async fn list_teams(&self) -> anyhow::Result<Vec<nuka_domain::team::Team>> { /* join agents */ }
    pub async fn load_team(&self, team_id: &str) -> anyhow::Result<Option<nuka_domain::team::Team>> { /* join agents */ }
    pub async fn delete_team(&self, team_id: &str) -> anyhow::Result<()> { /* soft delete */ }
}
```

```sql
create table if not exists teams (
  id text primary key,
  name text not null,
  goal text not null,
  summary text not null,
  success_criteria text not null,
  coordination_policy text not null,
  status text not null,
  created_at text not null,
  updated_at text not null
);
```

**Step 4: Run test to verify it passes**

Run: `cargo test -p nuka-storage saves_and_reads_team_definitions_and_agents saves_and_reads_team_run_snapshot_and_events -- --nocapture`

Expected: PASS with new repositories and migration tables.

**Step 5: Commit**

```bash
git add crates/nuka-storage/migrations/0001_initial.sql crates/nuka-storage/src/teams.rs crates/nuka-storage/src/team_runs.rs crates/nuka-storage/src/lib.rs
git commit -m "feat: persist teams and team runs"
```

### Task 3: Wire Real Provider Completions Into ChatService

**Files:**
- Modify: `crates/nuka-runtime/src/chat_service.rs`
- Modify: `apps/desktop/src-tauri/src/commands/chat.rs`
- Test: `crates/nuka-runtime/src/chat_service.rs`
- Test: `apps/desktop/src-tauri/src/commands/chat.rs`

**Step 1: Write the failing test**

```rust
#[tokio::test]
async fn chat_service_persists_assistant_completion() {
    let service = ChatService::new_for_test_with_default_provider();
    let turn = service.send_message("Summarize the release notes", None).await.unwrap();

    assert_eq!(turn.messages.len(), 2);
    assert!(matches!(
        turn.messages[1].role,
        nuka_domain::chat::ChatMessageRole::Assistant
    ));
}
```

**Step 2: Run test to verify it fails**

Run: `cargo test -p nuka-runtime chat_service_persists_assistant_completion -- --nocapture`

Expected: FAIL because `send_message` currently returns only the user message and never calls `complete_chat`.

**Step 3: Write minimal implementation**

```rust
let completion = self.provider_client.complete_chat(
    &provider,
    vec![OpenAiChatMessage::user(prompt.to_string())],
).await?;

let assistant_content = completion
    .choices
    .first()
    .map(|choice| choice.message.content.clone())
    .unwrap_or_default();

let assistant_message = nuka_domain::chat::ChatMessage {
    id: uuid::Uuid::new_v4().to_string(),
    session_id: session.id.clone(),
    role: nuka_domain::chat::ChatMessageRole::Assistant,
    content: assistant_content,
};

repo.append_message(assistant_message.clone()).await?;
```

**Step 4: Run test to verify it passes**

Run: `cargo test -p nuka-runtime chat_service_persists_assistant_completion -- --nocapture`

Expected: PASS with persisted assistant output and updated command payloads.

**Step 5: Commit**

```bash
git add crates/nuka-runtime/src/chat_service.rs apps/desktop/src-tauri/src/commands/chat.rs
git commit -m "feat: persist provider-backed chat completions"
```

### Task 4: Add TeamService For Provider-Backed Team Generation And CRUD

**Files:**
- Create: `crates/nuka-runtime/src/team_service.rs`
- Modify: `crates/nuka-runtime/src/lib.rs`
- Modify: `apps/desktop/src-tauri/src/app_state.rs`
- Modify: `apps/desktop/src-tauri/src/bootstrap.rs`
- Test: `crates/nuka-runtime/src/team_service.rs`

**Step 1: Write the failing test**

```rust
#[tokio::test]
async fn create_team_from_goal_persists_generated_agents() {
    let service = TeamService::new_for_test_with_provider();
    let team = service.create_team_from_goal("Ship the release and publish notes").await.unwrap();

    assert!(!team.id.is_empty());
    assert!(team.agents.len() >= 2);
    assert!(team.agents.iter().any(|agent| !agent.tool_bindings.is_empty()));
}
```

**Step 2: Run test to verify it fails**

Run: `cargo test -p nuka-runtime create_team_from_goal_persists_generated_agents -- --nocapture`

Expected: FAIL with missing `team_service` module and unresolved service registration.

**Step 3: Write minimal implementation**

```rust
pub struct TeamService {
    pool: sqlx::SqlitePool,
    provider_client: OpenAiCompatibleProvider,
}

impl TeamService {
    pub async fn create_team_from_goal(&self, goal: &str) -> anyhow::Result<nuka_domain::team::Team> {
        let provider = ProvidersService::new(self.pool.clone()).resolve_default_provider().await?;
        let response = self.provider_client.complete_chat(&provider, vec![
            OpenAiChatMessage::user(format!("Generate a team as JSON for this goal: {goal}"))
        ]).await?;
        let team = parse_generated_team(&response)?;
        nuka_storage::teams::TeamRepository::new(self.pool.clone()).save_team(team.clone()).await?;
        Ok(team)
    }
}
```

**Step 4: Run test to verify it passes**

Run: `cargo test -p nuka-runtime create_team_from_goal_persists_generated_agents -- --nocapture`

Expected: PASS with a saved team and explicit agent tool bindings.

**Step 5: Commit**

```bash
git add crates/nuka-runtime/src/team_service.rs crates/nuka-runtime/src/lib.rs apps/desktop/src-tauri/src/app_state.rs apps/desktop/src-tauri/src/bootstrap.rs
git commit -m "feat: add provider-backed team generation"
```

### Task 5: Add TeamRunService With Moderated Meeting Rounds

**Files:**
- Create: `crates/nuka-runtime/src/team_run_service.rs`
- Create: `crates/nuka-runtime/src/workspace_sessions.rs`
- Modify: `crates/nuka-runtime/src/runtime_events.rs`
- Modify: `crates/nuka-runtime/src/memory_hooks.rs`
- Modify: `crates/nuka-runtime/src/lib.rs`
- Test: `crates/nuka-runtime/src/team_run_service.rs`

**Step 1: Write the failing test**

```rust
#[tokio::test]
async fn team_run_starts_with_charter_agents_and_checkpoint() {
    let runtime = TeamRunService::new_for_test_with_provider();
    let run = runtime.start_team_run("team-release").await.unwrap();

    assert_eq!(run.charter.max_active_agents_per_round, 3);
    assert!(!run.agents.is_empty());
    assert!(run.events.iter().any(|event| event.kind == "checkpoint_summary"));
}

#[tokio::test]
async fn team_run_adds_runtime_agent_without_rewriting_existing_agents() {
    let runtime = TeamRunService::new_for_test_with_provider();
    let run = runtime.start_team_run("team-release").await.unwrap();
    let updated = runtime.add_runtime_agent(&run.id, sample_runtime_agent()).await.unwrap();

    assert_eq!(updated.agents.len(), run.agents.len() + 1);
    assert_eq!(updated.agents[0].responsibility, run.agents[0].responsibility);
}
```

**Step 2: Run test to verify it fails**

Run: `cargo test -p nuka-runtime team_run_starts_with_charter_agents_and_checkpoint -- --nocapture`

Expected: FAIL because no `TeamRunService` exists and there is no persisted run state.

**Step 3: Write minimal implementation**

```rust
pub async fn start_team_run(&self, team_id: &str) -> anyhow::Result<nuka_domain::team::TeamRun> {
    let team = self.team_repo.load_team(team_id).await?.ok_or_else(|| anyhow::anyhow!("unknown team"))?;
    let charter = nuka_domain::team::RunCharter::default_for_goal(team.goal.clone());
    let run = snapshot_team_into_run(team, charter);
    self.run_repo.create_run(run.clone()).await?;
    Ok(run)
}

pub async fn continue_team_run(&self, run_id: &str, prompt: &str) -> anyhow::Result<nuka_domain::team::TeamRun> {
    let mut run = self.run_repo.load_run(run_id).await?.unwrap();
    let agenda = self.coordinator.build_agenda(&run, prompt)?;
    let selected_agents = select_agents(&run.agents, &agenda, run.charter.max_active_agents_per_round);
    let next_events = self.execute_round(&run, &agenda, &selected_agents).await?;
    run.events.extend(next_events);
    self.run_repo.save_run(run.clone()).await?;
    Ok(run)
}
```

**Step 4: Run test to verify it passes**

Run: `cargo test -p nuka-runtime team_run_starts_with_charter_agents_and_checkpoint team_run_adds_runtime_agent_without_rewriting_existing_agents -- --nocapture`

Expected: PASS with durable runs, checkpoint summaries, and add-agent support.

**Step 5: Commit**

```bash
git add crates/nuka-runtime/src/team_run_service.rs crates/nuka-runtime/src/workspace_sessions.rs crates/nuka-runtime/src/runtime_events.rs crates/nuka-runtime/src/memory_hooks.rs crates/nuka-runtime/src/lib.rs
git commit -m "feat: add moderated team run runtime"
```

### Task 6: Extend Tool Registry And Tool-Call Events

**Files:**
- Modify: `crates/nuka-tools/src/registry.rs`
- Modify: `crates/nuka-tools/src/integrated.rs`
- Create: `crates/nuka-tools/src/opencode.rs`
- Modify: `crates/nuka-tools/src/lib.rs`
- Modify: `apps/desktop/src-tauri/src/commands/tools.rs`
- Test: `crates/nuka-tools/src/registry.rs`
- Test: `apps/desktop/src-tauri/src/commands/tools.rs`

**Step 1: Write the failing test**

```rust
#[test]
fn tool_registry_lists_codex_claude_code_and_opencode() {
    let names = crate::registry::ToolBindingSet::from_names(["codex", "claude_code", "opencode"]).into_vec();
    assert!(names.iter().any(|name| name == "opencode"));
}

#[test]
fn opencode_defaults_to_session_artifacts_scope() {
    let policy = crate::opencode::OpenCodeSession::default_policy();
    assert_eq!(policy.target_scope, crate::integrated::OutputScope::SessionArtifacts);
}
```

**Step 2: Run test to verify it fails**

Run: `cargo test -p nuka-tools opencode_defaults_to_session_artifacts_scope -- --nocapture`

Expected: FAIL because `opencode` does not exist and tool registry has no explicit catalog helpers.

**Step 3: Write minimal implementation**

```rust
pub struct ToolCatalogEntry {
    pub tool_name: &'static str,
    pub adapter_kind: &'static str,
    pub cost_class: &'static str,
}

pub fn default_team_tool_catalog() -> Vec<ToolCatalogEntry> {
    vec![
        ToolCatalogEntry { tool_name: "codex", adapter_kind: "integrated_agent", cost_class: "high" },
        ToolCatalogEntry { tool_name: "claude_code", adapter_kind: "integrated_agent", cost_class: "high" },
        ToolCatalogEntry { tool_name: "opencode", adapter_kind: "integrated_agent", cost_class: "high" },
        ToolCatalogEntry { tool_name: "search_knowledge", adapter_kind: "mcp", cost_class: "low" },
    ]
}
```

**Step 4: Run test to verify it passes**

Run: `cargo test -p nuka-tools tool_registry_lists_codex_claude_code_and_opencode opencode_defaults_to_session_artifacts_scope -- --nocapture`

Expected: PASS, and `integrated_tool_output_policy("opencode")` returns `session_artifacts`.

**Step 5: Commit**

```bash
git add crates/nuka-tools/src/registry.rs crates/nuka-tools/src/integrated.rs crates/nuka-tools/src/opencode.rs crates/nuka-tools/src/lib.rs apps/desktop/src-tauri/src/commands/tools.rs
git commit -m "feat: add explicit team tool catalog"
```

### Task 7: Add Tauri Team, Workspace, And Env Import Commands

**Files:**
- Create: `apps/desktop/src-tauri/src/commands/team.rs`
- Create: `apps/desktop/src-tauri/src/commands/workspace.rs`
- Modify: `apps/desktop/src-tauri/src/commands/mod.rs`
- Modify: `apps/desktop/src-tauri/src/commands/providers.rs`
- Modify: `apps/desktop/src-tauri/src/lib.rs`
- Modify: `apps/desktop/src-tauri/src/app_state.rs`
- Test: `apps/desktop/src-tauri/src/commands/team.rs`
- Test: `apps/desktop/src-tauri/src/commands/workspace.rs`
- Test: `apps/desktop/src-tauri/src/commands/providers.rs`

**Step 1: Write the failing test**

```rust
#[tokio::test]
async fn team_commands_create_and_start_run() {
    let state = crate::bootstrap::build_app_state_for_test().await.unwrap();
    configure_default_provider(&state).await;

    let team = super::create_team_from_goal_inner("Ship the release".to_string(), &state).await.unwrap();
    let run = super::start_team_run_inner(team.id.clone(), &state).await.unwrap();

    assert_eq!(run.team_id, team.id);
}

#[tokio::test]
async fn providers_import_from_env_creates_env_backed_provider() {
    std::env::set_var("NUKA_PROVIDER_NAME", "Env Local");
    std::env::set_var("NUKA_PROVIDER_BASE_URL", "http://localhost:11434/v1");
    std::env::set_var("NUKA_PROVIDER_MODEL", "gpt-oss");
    std::env::set_var("NUKA_PROVIDER_API_KEY", "");
    let state = crate::bootstrap::build_app_state_for_test().await.unwrap();

    let provider = super::import_provider_from_env_inner(&state).await.unwrap();
    assert_eq!(provider.name, "Env Local");
}
```

**Step 2: Run test to verify it fails**

Run: `cargo test -p desktop-tauri team_commands_create_and_start_run -- --nocapture`

Expected: FAIL with missing `team` or `workspace` command modules.

**Step 3: Write minimal implementation**

```rust
#[tauri::command]
pub async fn create_team_from_goal(goal: String, state: tauri::State<'_, AppState>) -> Result<TeamResponse, String> {
    create_team_from_goal_inner(goal, &state).await.map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn list_workspace_sessions(state: tauri::State<'_, AppState>) -> Result<Vec<WorkspaceSessionResponse>, String> {
    state.workspace_sessions().list().await.map(|items| items.into_iter().map(Into::into).collect()).map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn import_provider_from_env(state: tauri::State<'_, AppState>) -> Result<ProviderRecord, String> {
    import_provider_from_env_inner(&state).await.map_err(|error| error.to_string())
}
```

**Step 4: Run test to verify it passes**

Run: `cargo test -p desktop-tauri team_commands_create_and_start_run providers_import_from_env_creates_env_backed_provider -- --nocapture`

Expected: PASS with new commands registered in `src/lib.rs`.

**Step 5: Commit**

```bash
git add apps/desktop/src-tauri/src/commands/team.rs apps/desktop/src-tauri/src/commands/workspace.rs apps/desktop/src-tauri/src/commands/mod.rs apps/desktop/src-tauri/src/commands/providers.rs apps/desktop/src-tauri/src/lib.rs apps/desktop/src-tauri/src/app_state.rs
git commit -m "feat: expose team runtime tauri commands"
```

### Task 8: Add Frontend Team And Workspace Client Modules And Rename Navigation

**Files:**
- Create: `apps/desktop/src/lib/team.ts`
- Create: `apps/desktop/src/lib/workspace.ts`
- Modify: `apps/desktop/src/App.tsx`
- Modify: `apps/desktop/src/components/shell/shellNavigation.ts`
- Test: `apps/desktop/src/App.test.tsx`

**Step 1: Write the failing test**

```tsx
it("shows Team in navigation and routes team page through the shell", async () => {
  const view = await renderIntoDocument(<App />);
  expect(findText(view.container, "Team")).toBeTruthy();
  expect(findText(view.container, "Workflow")).toBeFalsy();
});
```

**Step 2: Run test to verify it fails**

Run: `npm.cmd --prefix apps/desktop test -- src/App.test.tsx`

Expected: FAIL because the shell still renders `Workflow` and there are no `team` or `workspace` clients.

**Step 3: Write minimal implementation**

```ts
// apps/desktop/src/lib/team.ts
export async function createTeamFromGoal(goal: string) {
  return invoke<TeamRecord>("create_team_from_goal", { goal });
}

export async function listTeams() {
  return invoke<TeamRecord[]>("list_teams");
}
```

```ts
// apps/desktop/src/components/shell/shellNavigation.ts
export type ShellPageId = "chat" | "team" | "agents" | "memory" | "knowledge" | "settings";
```

**Step 4: Run test to verify it passes**

Run: `npm.cmd --prefix apps/desktop test -- src/App.test.tsx`

Expected: PASS with `Team` in the nav and imports pointing at team clients.

**Step 5: Commit**

```bash
git add apps/desktop/src/lib/team.ts apps/desktop/src/lib/workspace.ts apps/desktop/src/App.tsx apps/desktop/src/components/shell/shellNavigation.ts apps/desktop/src/App.test.tsx
git commit -m "feat: switch shell navigation to team runtime"
```

### Task 9: Build The Team Page With Editable Agents And Tool Bindings

**Files:**
- Create: `apps/desktop/src/features/team/TeamPage.tsx`
- Create: `apps/desktop/src/features/team/TeamPage.test.tsx`
- Create: `apps/desktop/src/features/team/TeamList.tsx`
- Create: `apps/desktop/src/features/team/TeamEditor.tsx`
- Create: `apps/desktop/src/features/team/TeamAgentCard.tsx`
- Create: `apps/desktop/src/features/team/TeamToolBindingsPanel.tsx`
- Modify: `apps/desktop/src/App.tsx`

**Step 1: Write the failing test**

```tsx
it("creates a team from a goal and lets the user edit agent tools before starting a run", async () => {
  const view = await renderIntoDocument(<TeamPage />);
  await setInputValue(view.container, "Team goal", "Ship the release and publish notes");
  await clickButton(view.container, "Generate Team");

  expect(findText(view.container, "Release Team")).toBeTruthy();
  expect(findText(view.container, "Allowed tools")).toBeTruthy();
  expect(findText(view.container, "Start Run")).toBeTruthy();
});
```

**Step 2: Run test to verify it fails**

Run: `npm.cmd --prefix apps/desktop test -- src/features/team/TeamPage.test.tsx`

Expected: FAIL with missing `TeamPage` module and unresolved team client calls.

**Step 3: Write minimal implementation**

```tsx
export function TeamPage() {
  const [teams, setTeams] = useState<TeamRecord[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<TeamRecord | null>(null);
  const [goal, setGoal] = useState("");

  async function handleGenerate() {
    const created = await createTeamFromGoal(goal);
    setTeams((current) => [...current, created]);
    setSelectedTeam(created);
  }

  return (
    <div className="team-page">
      <TeamList teams={teams} selectedTeamId={selectedTeam?.id ?? null} onSelect={setSelectedTeam} />
      <TeamEditor team={selectedTeam} onGenerate={handleGenerate} />
    </div>
  );
}
```

**Step 4: Run test to verify it passes**

Run: `npm.cmd --prefix apps/desktop test -- src/features/team/TeamPage.test.tsx`

Expected: PASS with team creation, team editing, and tool-binding UI rendered from real payloads.

**Step 5: Commit**

```bash
git add apps/desktop/src/features/team/TeamPage.tsx apps/desktop/src/features/team/TeamPage.test.tsx apps/desktop/src/features/team/TeamList.tsx apps/desktop/src/features/team/TeamEditor.tsx apps/desktop/src/features/team/TeamAgentCard.tsx apps/desktop/src/features/team/TeamToolBindingsPanel.tsx apps/desktop/src/App.tsx
git commit -m "feat: add editable team page"
```

### Task 10: Add Workspace Session Tabs To Chat

**Files:**
- Create: `apps/desktop/src/hooks/useWorkspaceSessions.ts`
- Create: `apps/desktop/src/features/chat/SessionTabs.tsx`
- Modify: `apps/desktop/src/features/chat/ChatPage.tsx`
- Modify: `apps/desktop/src/features/chat/ChatPage.test.tsx`
- Modify: `apps/desktop/src/lib/chat.ts`

**Step 1: Write the failing test**

```tsx
it("renders top tabs for direct chats and team runs and switches the active session", async () => {
  const view = await renderIntoDocument(<ChatPage />);
  expect(findText(view.container, "Release Team Run")).toBeTruthy();
  expect(findText(view.container, "Design Review Chat")).toBeTruthy();
});
```

**Step 2: Run test to verify it fails**

Run: `npm.cmd --prefix apps/desktop test -- src/features/chat/ChatPage.test.tsx`

Expected: FAIL because `ChatPage` is still a single-session composer with no workspace-session loader.

**Step 3: Write minimal implementation**

```tsx
const { sessions, activeSession, setActiveSessionId } = useWorkspaceSessions();

return (
  <div className="chat-page">
    <SessionTabs sessions={sessions} activeSessionId={activeSession?.id ?? null} onSelect={setActiveSessionId} />
    {activeSession?.kind === "direct_chat" ? <DirectChatPanel session={activeSession} /> : <TeamRunPanel session={activeSession} />}
  </div>
);
```

**Step 4: Run test to verify it passes**

Run: `npm.cmd --prefix apps/desktop test -- src/features/chat/ChatPage.test.tsx`

Expected: PASS with multiple real tabs and active-session switching.

**Step 5: Commit**

```bash
git add apps/desktop/src/hooks/useWorkspaceSessions.ts apps/desktop/src/features/chat/SessionTabs.tsx apps/desktop/src/features/chat/ChatPage.tsx apps/desktop/src/features/chat/ChatPage.test.tsx apps/desktop/src/lib/chat.ts
git commit -m "feat: add workspace session tabs to chat"
```

### Task 11: Build The TeamRun Meeting Surface In Chat

**Files:**
- Create: `apps/desktop/src/features/chat/TeamRunPanel.tsx`
- Create: `apps/desktop/src/features/chat/AgentTeamStrip.tsx`
- Create: `apps/desktop/src/features/chat/RunEventFeed.tsx`
- Create: `apps/desktop/src/features/chat/RunCharterCard.tsx`
- Modify: `apps/desktop/src/features/chat/ChatPage.tsx`
- Modify: `apps/desktop/src/features/chat/ChatPage.test.tsx`

**Step 1: Write the failing test**

```tsx
it("shows the lead agent, current work, and tool activity for an active team run", async () => {
  const view = await renderIntoDocument(<ChatPage />);
  expect(findText(view.container, "Coordinator")).toBeTruthy();
  expect(findText(view.container, "Using search_knowledge")).toBeTruthy();
  expect(findText(view.container, "checkpoint_summary")).toBeTruthy();
  expect(findText(view.container, "Add Agent")).toBeTruthy();
});
```

**Step 2: Run test to verify it fails**

Run: `npm.cmd --prefix apps/desktop test -- src/features/chat/ChatPage.test.tsx`

Expected: FAIL because there is no team-run panel, no agent strip, and no tool event rendering.

**Step 3: Write minimal implementation**

```tsx
export function AgentTeamStrip({ agents, leadAgentId }: AgentTeamStripProps) {
  return (
    <div className="agent-team-strip">
      {agents.map((agent) => (
        <article key={agent.id} data-lead={agent.id === leadAgentId}>
          <strong>{agent.name}</strong>
          <span>{agent.status}</span>
          <p>{agent.currentWork}</p>
        </article>
      ))}
    </div>
  );
}
```

```tsx
export function TeamRunPanel({ run }: TeamRunPanelProps) {
  return (
    <>
      <AgentTeamStrip agents={run.agents} leadAgentId={run.leadAgentId} />
      <RunCharterCard charter={run.charter} />
      <RunEventFeed events={run.events} />
    </>
  );
}
```

**Step 4: Run test to verify it passes**

Run: `npm.cmd --prefix apps/desktop test -- src/features/chat/ChatPage.test.tsx`

Expected: PASS with a meeting-like team-run surface, tool events, and add-agent action.

**Step 5: Commit**

```bash
git add apps/desktop/src/features/chat/TeamRunPanel.tsx apps/desktop/src/features/chat/AgentTeamStrip.tsx apps/desktop/src/features/chat/RunEventFeed.tsx apps/desktop/src/features/chat/RunCharterCard.tsx apps/desktop/src/features/chat/ChatPage.tsx apps/desktop/src/features/chat/ChatPage.test.tsx
git commit -m "feat: add team run meeting surface"
```

### Task 12: Add Settings Env Import UI

**Files:**
- Modify: `apps/desktop/src/features/settings/SettingsPage.tsx`
- Modify: `apps/desktop/src/features/settings/SettingsPage.test.tsx`
- Modify: `apps/desktop/src/lib/providers.ts`

**Step 1: Write the failing test**

```tsx
it("imports a provider from env without silently overwriting existing providers", async () => {
  const view = await renderIntoDocument(<SettingsPage />);
  await clickButton(view.container, "Import From Env");

  expect(findText(view.container, "Env Local")).toBeTruthy();
});
```

**Step 2: Run test to verify it fails**

Run: `npm.cmd --prefix apps/desktop test -- src/features/settings/SettingsPage.test.tsx`

Expected: FAIL because there is no env import button and no client method.

**Step 3: Write minimal implementation**

```tsx
async function handleImportFromEnv() {
  const imported = await importProviderFromEnv();
  setProviders((current) => [...current, imported]);
}

<button className="settings-button" onClick={() => void handleImportFromEnv()} type="button">
  Import From Env
</button>
```

**Step 4: Run test to verify it passes**

Run: `npm.cmd --prefix apps/desktop test -- src/features/settings/SettingsPage.test.tsx`

Expected: PASS with an explicit env import flow and no silent provider replacement.

**Step 5: Commit**

```bash
git add apps/desktop/src/features/settings/SettingsPage.tsx apps/desktop/src/features/settings/SettingsPage.test.tsx apps/desktop/src/lib/providers.ts
git commit -m "feat: add env provider import flow"
```

### Task 13: Remove Legacy Workflow-Only Surface And Verify End-To-End

**Files:**
- Delete: `apps/desktop/src/lib/workflow.ts`
- Delete: `apps/desktop/src/features/workflow/WorkflowPage.tsx`
- Delete: `apps/desktop/src/features/workflow/WorkflowPage.test.tsx`
- Delete: `apps/desktop/src/features/workflow/WorkflowCatalog.tsx`
- Delete: `apps/desktop/src/features/workflow/WorkflowExplanationView.tsx`
- Delete: `apps/desktop/src/features/workflow/WorkflowRevisionPanel.tsx`
- Delete: `apps/desktop/src/features/workflow/WorkflowTimeline.tsx`
- Delete: `apps/desktop/src/features/workflow/WorkflowRoom.tsx`
- Delete: `apps/desktop/src/features/workflow/WorkflowLobby.tsx`
- Delete: `apps/desktop/src/features/workflow/AgentColumn.tsx`
- Modify: `apps/desktop/src/App.tsx`
- Modify: `apps/desktop/src/App.test.tsx`
- Modify: `README.md`
- Test: `apps/desktop/src/App.test.tsx`

**Step 1: Write the failing test**

```tsx
it("does not render any workflow-branded navigation or workflow-only controls", async () => {
  const view = await renderIntoDocument(<App />);
  expect(findText(view.container, "Workflow")).toBeFalsy();
  expect(findText(view.container, "Generate improved version")).toBeFalsy();
});
```

**Step 2: Run test to verify it fails**

Run: `npm.cmd --prefix apps/desktop test -- src/App.test.tsx`

Expected: FAIL while legacy workflow files and workflow branding still exist.

**Step 3: Write minimal implementation**

```tsx
// apps/desktop/src/App.tsx
import { TeamPage } from "./features/team/TeamPage";

const pageDefinitions: Record<AppPage, AppPageDefinition> = {
  chat: { label: "Chat", render: () => <ChatPage /> },
  team: { label: "Team", render: () => <TeamPage /> },
  // ...
};
```

Remove the obsolete workflow-only files once the new Team and Chat paths are green.

**Step 4: Run test to verify it passes**

Run:

```bash
npm.cmd --prefix apps/desktop test
npm.cmd --prefix apps/desktop run build
cargo test --workspace
```

Expected:

- frontend tests PASS
- frontend build PASS
- Rust workspace tests PASS

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: replace legacy workflow surface with team runtime"
```

### Task 14: Real Runtime Smoke And Evidence Capture

**Files:**
- Modify: `README.md`
- Create: `docs/plans/2026-03-11-team-runtime-verification.md`

**Step 1: Write the failing checklist**

```md
- configure a provider through Settings or env import
- create a team from a goal
- edit one generated agent and its tools
- start a run
- observe at least one real assistant response and one tool event
- add a runtime agent
- run two direct chats and two team runs in parallel tabs
- restart the app and confirm recovery
```

**Step 2: Run the smoke flow and record what fails first**

Run:

```bash
npm.cmd --prefix apps/desktop run build
cargo test -p desktop-tauri
```

Expected: at least one smoke gap remains until the real app has been exercised and documented.

**Step 3: Capture verification evidence**

```md
## Commands Run

~~~powershell
npm.cmd --prefix apps/desktop test
npm.cmd --prefix apps/desktop run build
cargo test --workspace
~~~

## Real App Observations

- Provider imported from env and selected as default
- Team created from goal
- Team run opened in Chat tab
- Agent strip showed current work and tool activity
```

**Step 4: Re-run the verification commands**

Run:

```bash
npm.cmd --prefix apps/desktop test
npm.cmd --prefix apps/desktop run build
cargo test --workspace
```

Expected: all scripted verification passes and the markdown record matches the observed runtime.

**Step 5: Commit**

```bash
git add README.md docs/plans/2026-03-11-team-runtime-verification.md
git commit -m "docs: record team runtime verification"
```
