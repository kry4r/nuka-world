# Desktop Frontend Analysis And Backend Guidance

Date: 2026-03-11

## Scope

This document audits the current desktop frontend in `apps/desktop/src` against the real state of the running Tauri app and the actual backend command surface in `apps/desktop/src-tauri/src/commands`.

The goal is not to redesign the app in this document. The goal is to record what the current product actually does, why the desktop UI feels cluttered, and how the frontend should contract around real backend capability instead of projected architecture.

This note was written after a limited shell cleanup that removed some global noise:

- the top workspace status strip
- extra brand text in the top-left shell
- some redundant shell metadata

That cleanup improved the frame, but the page-level product problem remains.

## Method

This analysis is based on two inputs gathered on 2026-03-11:

1. Code inspection of the React desktop frontend and Rust/Tauri command surface.
2. Live runtime inspection of the real desktop app through Tauri MCP.

Runtime inspection was performed against a running app in a realistic low-readiness state:

- no default provider configured
- no saved agents
- no memory graph nodes
- a default knowledge library with no sources
- no active workflow session

The runtime evidence matters because several problems only become obvious when the app is actually rendered.

## Anti-Pattern Verdict

Verdict: fail.

The current desktop UI does not primarily fail because of color or typography. It fails because it presents an architecture-first control surface before the user has earned any of that complexity.

The strongest anti-patterns are:

- workbench-first layout in empty states
- persistent inspector rails before meaningful objects exist
- repeated explanatory copy at header, card, and inspector levels
- advanced mode switches and control groups rendered before base setup is complete
- navigation that exposes the full product map even when the product is not materially ready

This does not read as a focused desktop app. It reads as an internal control console that has been exposed before the runtime state supports it.

## Executive Summary

The frontend is structurally ahead of the backend-backed user state.

The backend already provides real capabilities for provider configuration, chat routing, workflow sessions, local knowledge libraries, memory graph CRUD, and agent storage. But the frontend reveals too much page architecture before those capabilities have meaningful data behind them.

The biggest product mismatch is simple:

- the first real dependency is provider setup
- the first desired action is chat
- the first visible experience is still a multi-workbench shell

The most important conclusion is therefore not visual polish. It is progressive disclosure:

- default state should be quiet
- first action should be obvious
- advanced panels should appear only when there is real state to inspect

## Positive Findings

The current desktop codebase already has several useful foundations that should be kept:

- `useProviderGate` already centralizes provider readiness checks.
- `app_runtime_status` already exposes `provider`, `knowledge`, and `app` readiness.
- `Sidebar` is materially cleaner after the shell cleanup and now fits the user's request better.
- backend command surfaces for providers, memory, knowledge, agents, chat, and workflow are real, not mock-only.
- page-level concepts are separated cleanly enough that a future simplification pass can be done feature by feature.

The problem is not lack of capability. The problem is when and how that capability is surfaced.

## Runtime Evidence From Tauri MCP

The following observations were taken from the running app through Tauri MCP. These are the most important facts because they describe what the user actually sees, not what the code is trying to express.

### Cross-Page Runtime Summary

| Page | Live Layout Evidence | Product Problem |
| --- | --- | --- |
| Chat | one main column, 12 buttons, heading `Provider required`, disabled composer, visible `Composer context`, visible mode radio group | empty state still behaves like a routing console |
| Workflow | main area about 948px plus right inspector about 320px, 12 buttons, visible provider gate, visible workflow lobby and workflow context | blocked state still renders a studio layout |
| Agents | main area about 948px plus right inspector about 320px, 9 buttons, no saved agents, still shows quick create, editor, and details | no-data state still renders full CRUD/workbench structure |
| Memory | left utility rail about 288px, center about 642px, right inspector about 320px, 14 buttons, 0 nodes, 0 edges | empty graph still reserves a three-column editing environment |
| Knowledge | main area plus right inspector, selected library has `0 sources`, visible search, sources, jobs, engine controls | default library state still looks like a full operations console |
| Settings | one large main surface, 12 buttons, `0 configured`, `No default provider`, appearance still opens as a full form surface | provider setup is the real blocker but is not visually treated as the primary job |

### Chat Runtime Findings

Accessibility snapshot from Tauri MCP showed the following visible structure on first load:

- heading `Provider required`
- paragraph `Provider required`
- button `Open Settings`
- composer block with `Composer context`
- copy `Starting in Chat only`
- radio group with `Chat only`, `Create workflow`, `Specific workflow`
- disabled textbox
- disabled send button

This is the clearest mismatch in the product.

The user's requested model is simple:

- logo
- one conversation box

The current rendered model is:

- logo
- provider gate card
- mode explanation
- mode switcher
- disabled composer

That is too much UI before the first message exists.

### Workflow Runtime Findings

Runtime inspection showed the following headings in a blocked state:

- `Saved Workflows`
- `Provider required`
- `Workflow Lobby`
- `Research Brief`
- `Release Notes`
- `Customer Triage`
- `Run Research Brief`
- `Workflow Context`
- `Selected Workflow`
- `Required Inputs`
- `Execution`

That is a large amount of structure for a page that cannot yet start.

The page is simultaneously doing three jobs:

- template selection
- blocked-state explanation
- room/context framing

Those jobs should not share the same first screen.

### Agents Runtime Findings

Runtime inspection showed:

- no saved agents
- `Create From One Sentence`
- `Provider required`
- `Agent Editor`
- right-side `Agent Details`

This means the page presents authoring, editing, and inspection states before there is even one real agent record to operate on.

The page is too eager to look mature.

### Memory Runtime Findings

Runtime inspection showed:

- `0 nodes`
- `0 edges`
- left `Graph Utilities` rail
- search, filter, view mode, zoom controls
- `Activation`, `Consolidation`, `Schema`
- center `Graph Workspace`
- empty-state heading `No graph nodes yet`
- right `Node Inspector`

This is the most obvious example of workbench-first design.

When the graph is empty, the page still reserves the full three-column editing model and exposes advanced graph terminology by default. The result is that the user sees the framework of a tool before they see the object the tool exists to manage.

### Knowledge Runtime Findings

Runtime inspection showed:

- selected library `User Knowledge Base`
- `0 sources`
- search input and search button
- folder path field
- `Add Folder`
- `Rebuild Index`
- mode tabs for `Search`, `Sources`, `Jobs`, `Engine`
- right-side `Knowledge Inspector`
- engine metadata such as `Engine Summary`, `Engine Health`, and `Capabilities`

The page reveals ingestion, search, indexing, and engine diagnostics at the same visual level even when the library has no connected source.

That is useful for a backend admin console. It is too heavy for the default product state.

### Settings Runtime Findings

After shell cleanup, Settings is materially simpler than before. That improvement is real. But the page still has the wrong priority structure for the current product.

Runtime inspection showed:

- header `Application Settings`
- status surface showing `0 configured` and `No default provider`
- section strip for `Appearance`, `Providers`, `Runtime`
- full `Appearance Defaults` form rendered by default

This is the wrong first screen when provider setup is the only real blocker that prevents Chat, Workflow, and agent generation from working.

The page should not present appearance and runtime preferences as equally urgent to provider configuration.

## Detailed Findings By Severity

### Critical

#### 1. Provider-blocked pages still render advanced surfaces

- Location: `apps/desktop/src/features/chat/ChatPage.tsx`, `apps/desktop/src/features/workflow/WorkflowPage.tsx`, `apps/desktop/src/features/agents/AgentsPage.tsx`, `apps/desktop/src/hooks/useProviderGate.ts`
- Category: Information architecture / onboarding
- Description: The provider gate is implemented as an extra block inside large pre-rendered interfaces instead of replacing those interfaces with a minimal blocked state.
- Impact: The user sees a product that looks complicated and unavailable at the same time.
- Recommendation: Convert provider gating from additive messaging to primary state substitution. On blocked pages, render only the minimum blocked surface for the next action.

#### 2. Chat does not match the product's natural first-run task

- Location: `apps/desktop/src/features/chat/ChatPage.tsx`
- Category: Onboarding / empty-state design
- Description: The first-run chat screen still shows routing concepts, composer context, and mode controls before a session exists.
- Impact: The page teaches architecture instead of enabling conversation.
- Recommendation: Reduce first-run Chat to `logo + composer`. Fold provider status into the composer shell instead of a separate large card. Hide workflow routing until the first message or a clear explicit action.

#### 3. Empty data states default to workbench layouts

- Location: `apps/desktop/src/features/memory/MemoryPage.tsx`, `apps/desktop/src/features/knowledge/KnowledgePage.tsx`, `apps/desktop/src/features/agents/AgentsPage.tsx`, `apps/desktop/src/features/workflow/WorkflowPage.tsx`
- Category: Information architecture
- Description: Multiple pages render utility rails, inspectors, and control clusters before meaningful objects exist.
- Impact: The UI feels noisy, incomplete, and cognitively expensive.
- Recommendation: Make the empty state the primary layout. Only promote to a workbench once there is real data, a selected object, or an active session.

### High

#### 4. Inspectors duplicate context that should stay in the main surface

- Location: `apps/desktop/src/features/workflow/WorkflowPage.tsx`, `apps/desktop/src/features/agents/AgentsPage.tsx`, `apps/desktop/src/features/memory/MemoryPage.tsx`, `apps/desktop/src/features/knowledge/KnowledgePage.tsx`
- Category: Information density
- Description: Right-side inspectors are visible even when the main surface already contains the key context or when there is no meaningful object selected.
- Impact: Horizontal sprawl and repeated information reduce signal.
- Recommendation: Only show inspectors when they add object-specific detail that cannot live inline. Hide them entirely in blank and blocked states.

#### 5. Navigation exposes the full product map regardless of readiness

- Location: `apps/desktop/src/App.tsx`, `apps/desktop/src/components/shell/Sidebar.tsx`
- Category: Onboarding / product framing
- Description: The sidebar exposes Chat, Workflow, Agents, Memory, Knowledge, and Settings equally even when the app is effectively still in setup.
- Impact: Users can enter shells of features that are not yet materially useful.
- Recommendation: Keep navigation stable if needed, but visually demote not-ready areas or provide softer empty-state entry points rather than full workbenches.

#### 6. Settings does not prioritize provider configuration strongly enough

- Location: `apps/desktop/src/features/settings/SettingsPage.tsx`
- Category: Onboarding / task hierarchy
- Description: Appearance and runtime configuration sit alongside provider configuration at the same level even when no provider exists.
- Impact: The product's first necessary task is visually diluted.
- Recommendation: Make Providers the default first section when no default provider exists. Collapse appearance and runtime until setup is complete.

#### 7. Frontend reveals future-oriented structures before backend-backed data exists

- Location: `apps/desktop/src/features/chat/ChatPage.tsx`, `apps/desktop/src/features/agents/AgentsPage.tsx`
- Category: Product-state mismatch
- Description: UI areas imply attached agents, attached knowledge, editable bindings, and richer orchestration context even though the backend currently returns little or no real data for those surfaces.
- Impact: The product feels more complicated than it is.
- Recommendation: Hide or defer surfaces whose backing data is empty by design.

#### 8. The desktop pages do not share a stable page grammar

- Location: `apps/desktop/src/features/chat/ChatPage.tsx`, `apps/desktop/src/features/workflow/WorkflowPage.tsx`, `apps/desktop/src/features/agents/AgentsPage.tsx`, `apps/desktop/src/features/memory/MemoryPage.tsx`, `apps/desktop/src/features/knowledge/KnowledgePage.tsx`, `apps/desktop/src/features/settings/SettingsPage.tsx`
- Category: Structural consistency
- Description: Workflow, Agents, Memory, and Knowledge mostly use `SectionHeader + main surface + inspector`, while Chat skips the shared header model and Settings uses its own overview-plus-strip structure.
- Impact: Every page teaches different layout rules, which makes the shell feel heavier and less coherent.
- Recommendation: Choose one calm page grammar for default states, then allow richer deviations only when a page has enough real state to justify them.

### Medium

#### 9. Workflow definitions are frontend-owned and over-expressed

- Location: `apps/desktop/src/lib/workflow.ts`, `apps/desktop/src/features/workflow/WorkflowPage.tsx`
- Category: Product architecture
- Description: Workflows are currently presented as a rich catalog, but the catalog is still defined in frontend constants rather than driven from a backend directory.
- Impact: The UI can look more dynamic and authoritative than the backend contract really is.
- Recommendation: Until workflows are backend-owned, present them as simple templates rather than a full saved-workflows control plane.

#### 10. Knowledge has a first-run bootstrap mismatch

- Location: `apps/desktop/src/features/knowledge/LibraryExplorer.tsx`, `apps/desktop/src/features/knowledge/KnowledgeWorkbench.tsx`, `apps/desktop/src/features/knowledge/KnowledgePage.tsx`
- Category: Empty-state UX
- Description: The explorer tells the user to add a folder from the workbench when no libraries exist, but the workbench action expects a selected library.
- Impact: The initial knowledge setup path is contradictory before the user has any source configured.
- Recommendation: Provide one explicit first-run path: select or create a library first, then reveal connector actions.

#### 11. Card, badge, and helper-copy layering makes empty states feel heavier than they are

- Location: shared across `SectionHeader`, `Card`, `Inspector`, and multiple feature pages
- Category: Visual hierarchy
- Description: The same state is often described in headers, card descriptions, helper paragraphs, and inspectors.
- Impact: The user must scan multiple regions to learn one fact.
- Recommendation: Keep one primary explanation per state. Delete the rest.

#### 12. Shell abstractions still carry some residue from the old, noisier model

- Location: `apps/desktop/src/components/shell/AppShell.tsx`, `apps/desktop/src/components/ui/SectionHeader.tsx`
- Category: Maintainability / UI consistency
- Description: `AppShell` still keeps an optional `inspector` slot that is no longer used from `App.tsx`, and `SectionHeader` still accepts a `tag` prop that is no longer rendered.
- Impact: These leftovers encourage more shell-level layering later.
- Recommendation: Remove dead shell abstractions in a follow-up cleanup once page simplification direction is settled.

### Low

#### 13. Theme and layout styles remain concentrated in a large shared stylesheet

- Location: `apps/desktop/src/styles/theme.css`
- Category: Maintainability
- Description: Shell, chat, settings, and graph-related styles are still concentrated in a single large stylesheet.
- Impact: Simplification work becomes harder to isolate and reason about.
- Recommendation: As pages are simplified, separate feature-level styles enough that each page can shed chrome without side effects.

## Backend Reality And Frontend Mismatch

The backend is not as empty as the current UI sometimes implies, but it is also not rich enough to justify the current default surface area.

### Runtime Gating That Already Exists

Relevant files:

- `apps/desktop/src/hooks/useAppRuntimeStatus.ts`
- `apps/desktop/src/hooks/useProviderGate.ts`
- `apps/desktop/src-tauri/src/commands/app.rs`

`app_runtime_status` currently exposes:

- `provider`
- `knowledge`
- `app`

Each one has a simple `kind` and `message`. For provider readiness, the key paths are:

- `ready`
- `missing`
- `degraded`

Important constraint:

- `ready` currently means `resolve_default_provider()` succeeded
- it does not mean the provider was freshly reachability-tested at render time

This is already enough to drive first-run UI contraction, but the current frontend mostly uses it to add warning surfaces rather than replace heavy ones.

### Chat Reality

Relevant files:

- `apps/desktop/src/lib/chat.ts`
- `apps/desktop/src-tauri/src/commands/chat.rs`

What is real today:

- session creation and continuation
- route classification
- provider-backed chat turns
- memory runtime event emission after chat completion

What is still shallow today:

- route selection is primarily mode-driven, not a richer planner
- visible attached context is not materially populated
- the chat payload presented by the UI is richer than the currently exercised runtime

What is not materially populated today:

- `attached_agents`
- `attached_knowledge_libraries`

Those arrays are returned empty in `chat.rs`, which means the frontend should not reserve much visible UI for that context yet.

### Workflow Reality

Relevant files:

- `apps/desktop/src/lib/workflow.ts`
- `apps/desktop/src-tauri/src/commands/workflow.rs`

What is real today:

- workflow session start
- workflow session continuation
- origin handoff from chat
- event-based workflow session payloads

What is still frontend-owned:

- the catalog of workflow definitions in `WORKFLOW_DEFINITIONS`

What is still weaker than the UI implies:

- workflow sessions are presented like a durable orchestration surface
- the backend path is still closer to an in-memory, synthetic room runtime than a fully persisted multi-agent workflow system

This means the UI should behave like a compact template launcher plus room, not a dense saved-workflow management plane.

### Agents Reality

Relevant files:

- `apps/desktop/src/lib/agents.ts`
- `apps/desktop/src-tauri/src/commands/agents.rs`

What is real today:

- list agents
- save agents
- delete agents
- generate a provider-backed draft

What is still effectively empty:

- knowledge bindings
- memory scope bindings

`agents.rs` saves presets with `knowledge_collection_ids: Vec::new()` and `memory_scope_ids: Vec::new()`. The frontend should not visually prioritize these until there is real backing behavior.

### Memory Reality

Relevant files:

- `apps/desktop/src/lib/memory.ts`
- `apps/desktop/src-tauri/src/commands/memory.rs`

What is real today:

- memory graph load
- node and edge CRUD
- pending memory candidate review

What the product state usually starts with:

- no graph nodes
- no selected node

That means the correct default is not a full graph control cockpit. The correct default is a quiet empty graph state that can grow into an editor once data exists.

### Knowledge Reality

Relevant files:

- `apps/desktop/src/lib/knowledge.ts`
- `apps/desktop/src-tauri/src/commands/knowledge.rs`

What is real today:

- local knowledge libraries
- local folder connectors
- index rebuild jobs
- search
- engine summary

What the product state often starts with:

- one default library
- zero connectors
- zero sources
- no jobs worth inspecting

That means the frontend should start with library selection plus connector setup, not a complete multi-tab workbench.

### Settings And Providers Reality

Relevant files:

- `apps/desktop/src/features/settings/SettingsPage.tsx`
- `apps/desktop/src-tauri/src/commands/providers.rs`
- `apps/desktop/src-tauri/src/commands/settings.rs`

What is real today:

- provider CRUD
- provider connection testing
- default provider selection
- persisted local settings

What is weaker than the UI implies:

- several settings behave as stored preferences rather than live runtime controls
- the UI language makes some settings feel operationally active even when they are mostly persistence-only

The frontend already has the backend it needs for a provider-first onboarding flow. The current issue is prioritization, not missing capability.

## Patterns And Systemic Problems

The following problems repeat often enough that they should be treated as system-level issues, not page-specific bugs.

### 1. Architecture-First Rendering

The pages present the shape of a future mature product before the runtime state supports it.

### 2. Additive Blocking

Blocked states are added on top of large interfaces rather than replacing them.

### 3. Inspector Overuse

Inspectors appear as a default structural habit rather than a state-dependent detail surface.

### 4. Empty-State Neglect

Pages are designed primarily for the active, data-rich case, even though the current product mostly lives in sparse states.

### 5. Repeated Context

Headers, cards, badges, and helper copy often repeat the same message.

## Recommendations By Priority

### Immediate

1. Make Chat first-run state `logo + composer` only.
2. Convert provider gating into state replacement instead of a warning card layered onto full pages.
3. Make Settings default to Providers whenever no default provider exists.

### Short-Term

1. Collapse Workflow into two states only: template launcher or active room.
2. Collapse Agents into two states only: empty/create or existing/edit.
3. Hide inspector rails on blank and blocked pages.

### Medium-Term

1. Collapse Knowledge into library setup first, then search/index operations after connectors exist.
2. Collapse Memory into empty graph first, then node-focused editor only after graph content exists.
3. Remove repeated explanatory copy across headers, cards, and inspectors.

### Long-Term

1. Add lightweight backend summary counts so the frontend can distinguish readiness from meaningful data.
2. Move workflow definitions toward a backend-owned contract.
3. Remove stale shell abstractions that encourage unnecessary chrome.

## Suggested Backend Additions

The backend already exposes enough for a calmer frontend, but a few additions would make progressive disclosure much easier.

Suggested summary fields:

- `providersConfigured`
- `hasDefaultProvider`
- `savedAgentCount`
- `memoryNodeCount`
- `knowledgeConnectorCount`
- `knowledgeJobCount`
- `activeWorkflowSessionCount`

These do not need to replace existing APIs. They only need to help the frontend choose between:

- blocked state
- empty state
- simple populated state
- full workbench state

## Suggested Follow-Up Skills

If this audit is used as the implementation source of truth, the most relevant follow-up skills are:

- `distill` for removing page-level noise and collapsing overbuilt surfaces
- `onboard` for provider-first setup and empty-state flows
- `normalize` for reducing repeated card/badge patterns
- `clarify` for deleting or compressing helper copy that repeats visible context
- `polish` only after the structural contraction work is complete

## Conclusion

The current frontend is not mainly suffering from isolated layout bugs. It is suffering from incorrect default product posture.

Right now the app behaves as if it already has:

- connected providers
- meaningful chat context
- real saved agents
- populated memory
- indexed knowledge
- active workflows

But the real runtime state often starts with none of those.

The frontend should therefore stop presenting the entire product architecture at time zero.

The correct direction is:

- quiet shell
- provider-first setup
- chat-first entry
- state-gated disclosure
- advanced panels only when there is a real object to inspect

That shift will reduce clutter more effectively than local styling adjustments and will align the frontend with the backend that actually exists today.

## Appendix: Session Evidence

This document is backed by a real desktop session inspected through Tauri MCP on 2026-03-11. During that session:

- `Chat` was inspected in a provider-missing state and still rendered `Composer context`, `Starting in Chat only`, a mode radio group, and a disabled composer.
- `Workflow` was inspected in a provider-missing state and still rendered both a workflow lobby and a right-side context inspector.
- `Agents` was inspected with no saved agents and still rendered create, editor, and details surfaces together.
- `Memory` was inspected with `0 nodes` and `0 edges` and still rendered a three-column workbench.
- `Knowledge` was inspected with a default library at `0 sources` and still rendered search, source, jobs, engine, and inspector surfaces.
- `Settings` was inspected after shell cleanup and still defaulted to a broader appearance/settings surface instead of a provider-first setup view.

This note was also validated against the current desktop frontend test/build commands:

- `npm test` in `apps/desktop`
- `npm run build` in `apps/desktop`
