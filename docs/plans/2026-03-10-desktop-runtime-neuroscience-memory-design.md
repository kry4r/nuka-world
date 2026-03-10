# Desktop Runtime Neuroscience Memory Design

**Date:** 2026-03-10

## Summary

This design evolves Nuka World from a frontend redesign with partial runtime truth into a fully connected desktop app with:

- real `Tauri -> Rust -> storage -> provider/knowledge/memory` flows on every primary surface,
- a packaged, app-bundled `PageIndex` runtime so `Knowledge` works out of the box,
- strict provider gating for `Chat`, `Workflow`, and `Agent draft`,
- a neuroscience-informed memory system that keeps the current graph activation UX,
- review-gated long-term semantic memory promotion through inline `Chat` and `Workflow` review docks.

The core product decision is to keep `Memory` graph-first. `Nocturne Memory` is reference material for audit history, boot anchors, and review ideas, but not the primary model. The primary model is a graph activation system shaped by working memory, episodic traces, semantic schemas, consolidation, retrieval cues, and inhibitory decay.

## Product Decisions

1. `Chat`, `Workflow`, and `Agent draft` must be strictly real. If no provider is configured, they are blocked truthfully.
2. `Knowledge` must be usable after install without requiring the user to install a separate runtime. `PageIndex` is bundled with the app.
3. `Memory` remains graph-first. Do not pivot to a URI-first or tree-first product model.
4. Long-term semantic memory formation is never fully automatic. The runtime may generate candidates, but promotion into semantic memory requires user review.
5. The review control lives inside `Chat` and `Workflow` near the composer, not in a detached admin screen.
6. Hooking is required, but as typed runtime observers plus narrow React hooks, not as a generic plugin marketplace.

## Current State And Gaps

### What Is Already Real

- `Settings` persists provider and runtime preferences through Rust storage.
- `Chat` routes direct-reply turns through provider-backed chat service.
- `Agents` already save, delete, and draft through backend commands.
- `Memory` already persists graph nodes and edges in SQLite.
- `Knowledge` already persists libraries, connectors, and index job records.

### What Is Still Incomplete

- `Workflow` runtime is still seeded with local stub events instead of provider-backed execution.
- `Knowledge` search is still a thin placeholder over collection metadata, not real index retrieval.
- `PageIndex` health currently depends on a runtime path existing outside the packaged app.
- `Memory` is graph CRUD only. It does not yet encode working memory, episodic traces, semantic schemas, candidate consolidation, activation spread, or review outcomes.
- `Chat` and `Workflow` do not yet emit memory candidates or show inline review controls.

## Goals

### Primary Goals

- Make the packaged desktop app start cleanly with no external runtime installation besides the user's chosen model provider.
- Ensure `Settings -> configure provider -> test -> set default -> use Chat/Workflow/Agents` is the canonical happy path.
- Replace remaining workflow, knowledge, and memory placeholders with truthful runtime behavior.
- Evolve memory using neuroscience-informed mechanisms without abandoning the existing graph activation interaction model.

### Non-Goals

- Do not build a general-purpose external plugin framework in the first iteration.
- Do not make `Nocturne Memory` URI routing the product center.
- Do not ship fully automatic semantic memory mutation without review.
- Do not require a hosted vector database or cloud knowledge backend.

## Research Basis

This design is an engineering interpretation of current neuroscience, not a literal biological simulation.

### Working Memory And Long-Term Formation

Working memory maintenance and updating should be modeled as an active, short-lived buffer because maintained content influences what becomes durable later.

- Ranganath et al. 2005 showed that early working-memory maintenance contributes directly to later long-term memory formation and implicates dorsolateral prefrontal cortex and hippocampus.
- Daume et al. 2024 showed persistent hippocampal activity during working-memory maintenance predicts later long-term memory formation.

### Systems Consolidation And Transformation

Consolidation is not just storage hardening. It is reorganization and abstraction across hippocampal and cortical systems.

- Squire et al. 2015 summarizes systems consolidation as hippocampal guidance of neocortical reorganization.
- Robin and Moscovitch 2019 argues retrieval and contextual binding remain important and warns against simplistic “hippocampus now, cortex later” assumptions.

### Schema-Supported Integration

Schemas accelerate integration of congruent information and support coarser, more general representations over time.

- Audrain and McAndrews 2022 showed schema-congruent memories integrate into medial prefrontal representations over time.
- Guo et al. 2023 further supports schema-related post-encoding connectivity and durable memory.

### Cue-Driven Retrieval And Pattern Completion

Retrieval is cue-driven reactivation rather than full-database replay.

- Trelle et al. 2020 linked hippocampal activity and cortical reinstatement to episodic retrieval variability.
- Horner et al. 2015 provided evidence for holistic episodic recollection via hippocampal pattern completion.

### Linking Memories Across Time

Temporally proximal memories can become linked through overlapping allocation and co-activation.

- Kastellakis et al. 2016 modeled memory linking across time through overlapping neural and dendritic representations.

### Adaptive Forgetting And Inhibitory Competition

Useful memory systems reduce interference instead of only accumulating more items.

- Wu et al. 2014 showed retrieval-induced forgetting depends on hippocampal and medial prefrontal mechanisms.

## Design Principles

1. Separate `memory function` from `memory ownership`.
2. Keep graph activation as the primary mental model.
3. Make consolidation observable and reviewable.
4. Prefer typed state and typed events over opaque JSON blobs.
5. Keep the app honest when blocked by missing provider or failed runtime.
6. Bundle local knowledge infrastructure so “one-click startup” is real.

## Runtime Architecture

The desktop app should operate as five coordinated layers:

1. `Bootstrap layer`
- app data directory resolution,
- SQLite initialization and migrations,
- bundled `PageIndex` runtime resolution,
- default settings and knowledge library setup.

2. `Capability layer`
- provider state,
- knowledge engine health,
- app runtime status,
- memory pipeline readiness.

3. `Execution layer`
- chat execution,
- workflow orchestration,
- agent drafting,
- knowledge indexing and search,
- memory event pipeline.

4. `Review layer`
- pending memory candidates,
- inline review decisions,
- audit snapshots.

5. `Visualization layer`
- chat/workflow review dock,
- memory activation graph,
- knowledge runtime status,
- settings gating and recovery.

## Full Frontend-To-Backend Contract

Every primary frontend surface must consume typed backend commands only. No page should rely on local decorative fallback state to pretend work completed.

### Surface Contract States

Each page should render one of three explicit states:

- `ready`
- `blocked_by_provider`
- `backend_error`

`Knowledge` is the one exception for provider gating: it should remain available without provider configuration because the bundled `PageIndex` path is local.

### Boot And Readiness States

The app should model runtime readiness explicitly:

- `bootstrapped`
- `knowledge_ready`
- `provider_missing`
- `provider_ready`
- `degraded`

These states should be exposed through a shared backend command and consumed by the shell and page-level hooks.

## Provider Gate

### Expected User Flow

1. Install and open the desktop app.
2. The app boots local storage and bundled knowledge runtime automatically.
3. `Chat`, `Workflow`, and `Agent draft` show a truthful blocked state until a default provider is configured.
4. The user opens `Settings`, adds provider credentials, tests the connection, and marks the provider as default.
5. The app transitions into `provider_ready`.
6. `Chat`, `Workflow`, and `Agents` become usable immediately without restart.

### Surface Behavior

- `Chat`: composer disabled when provider is missing, with a direct route to `Settings`.
- `Workflow`: start/continue controls disabled when provider is missing.
- `Agents`: draft generation disabled when provider is missing, save/edit still allowed.
- `Knowledge`: fully available regardless of provider.
- `Memory`: graph and review history available regardless of provider, but no new candidates appear until provider-backed or workflow-backed runtime events occur.

## Bundled PageIndex And One-Click Packaging

The current `PageIndexEngine` only checks whether a runtime path exists. To satisfy the packaging goal, the runtime must be distributed with the desktop app.

### Packaging Contract

- bundle `PageIndex` in Tauri resources for each supported platform,
- resolve its absolute runtime path during bootstrap,
- instantiate `KnowledgeService` with that bundled runtime path,
- create the default knowledge library on first run,
- expose engine health truthfully in the UI.

### Startup Outcome

After installation, without any extra CLI install:

- the app starts,
- `Knowledge` can add connectors, rebuild indexes, and search,
- failures in knowledge runtime are treated as packaging defects or local runtime defects, not as missing user setup.

## Knowledge Evolution

### Required Runtime Behavior

`Knowledge` must move from metadata search to actual local retrieval:

- add folder connector,
- crawl supported files,
- build index using bundled `PageIndex`,
- record real indexing jobs with status and detail,
- execute real searches against indexed content,
- return file path plus text snippets grounded in indexed data.

### UI Behavior

- `KnowledgePage` stays split into explorer, workbench, jobs, and engine panel.
- engine health becomes actionable because the runtime is now bundled and expected to work.
- search results should reflect indexed content, not collection/path-name string matches.

## Workflow Evolution

`WorkflowRuntime` must stop being a seeded local transcript generator and become provider-backed orchestration that emits structured runtime events.

### Required Behavior

- starting a workflow session uses the configured provider and workflow definition,
- continuing a workflow session emits real transcript and timeline events,
- workflow events become inputs to the memory event pipeline,
- workflow state remains truthful across restarts where persistence is expected.

### Scope Constraint

The first implementation can remain single-provider and local-first. It does not need a distributed scheduler or multi-tenant execution model.

## Neuroscience-Informed Memory Model

The core design separates memory into two orthogonal axes.

### Function Axis

- `Working`
- `Episodic`
- `Semantic`

### Ownership Axis

- `Session`
- `Workflow`
- `Agent`
- `Global`

This means a memory item is not just a “workflow node” or “fact node.” It is described by both:

- what kind of memory trace it is,
- and who owns or can reuse it.

## Memory Data Model

The graph remains the primary storage and visualization shape, but nodes and edges gain memory-state semantics.

### Nodes

In addition to current identifiers and content, nodes should include:

- `trace_type`: `working | episodic | semantic`
- `scope_owner`: `session | workflow | agent | global`
- `consolidation_state`: `none | candidate | approved | rejected | archived`
- `salience`
- `activation_level`
- `rehearsal_count`
- `schema_id`
- `last_activated_at`
- `last_reviewed_at`
- `source_session_id`
- `source_workflow_id`
- `source_agent_id`

### Edges

Edges need both descriptive and activation semantics:

- `edge_type`: `temporal | causal | supports | schema_member | cue | conflict | inhibits | derived_from`
- `weight`
- `co_activation_score`
- `decay_bias`

### Candidate And Snapshot Records

Add review-oriented storage:

- `memory_candidates`
- `memory_candidate_evidence`
- `memory_snapshots`
- `memory_review_actions`

These are the pieces borrowed conceptually from `Nocturne Memory`: auditability, reviewability, and stable history.

## Memory Lifecycle

1. Runtime events land in a short-lived `working activation buffer`.
2. Significant events become `episodic` traces.
3. Repeated, salient, or schema-congruent traces produce `candidate` proposals.
4. The user reviews each candidate from `Chat` or `Workflow`.
5. Review decision determines whether the trace:
- becomes or updates a `semantic` node,
- stays as `episodic`,
- or is rejected and suppressed or archived.

There is no silent semantic promotion.

## Memory Hooks

Hooking is required, but it should be typed and bounded.

### Backend Typed Event Hooks

Introduce a runtime event pipeline with fixed event types:

- `chat_turn_completed`
- `workflow_session_started`
- `workflow_turn_completed`
- `knowledge_search_completed`
- `memory_candidate_reviewed`

Observers attached to this pipeline should include:

- `ActivationHook`
- `EpisodicEncodingHook`
- `ConsolidationProposalHook`
- `SchemaLinkingHook`
- `ReviewOutcomeHook`

These are not arbitrary plugins. They are structured domain observers.

### Frontend React Hooks

The frontend should use narrow hooks that consume backend commands:

- `useProviderGate()`
- `useMemoryReviewDock(surface, ownerId)`
- `useActivationGraph(scope)`
- `useKnowledgeEngineStatus()`
- `useWorkflowRuntimeState(sessionId)`

## Inline Review Dock

### Placement

Create a shared `MemoryReviewDock` component:

- `Chat`: between composer context controls and the input bar,
- `Workflow`: above the room input area in the same visual stratum.

### Actions

The review dock uses a three-option segmented control:

- `转入长期语义记忆`
- `暂留为情景记忆`
- `拒绝`

The control should not auto-commit. Selection plus explicit apply is safer.

### Review Payload

Each candidate should show:

- candidate title,
- source surface (`Chat` or `Workflow`),
- suggested schema,
- evidence count,
- confidence and reason in compact form,
- queue position if multiple candidates are pending.

## Memory Page Evolution

The current `Memory Graph Workbench` should evolve instead of being replaced.

### New Views

- `Activation view`
- `Consolidation view`
- `Schema view`

### Visual Semantics

- `Working` nodes: high transient glow, fast decay
- `Episodic` nodes: event-rich detail, source context, temporal edges
- `Semantic` nodes: stable schema clusters, calmer emphasis
- `Candidate` state: amber review emphasis
- `Approved` state: subdued stable accent
- `Rejected` or `Archived`: low-energy, visually suppressed

### Inspector

The inspector should expose:

- trace type,
- scope ownership,
- activation metrics,
- evidence links,
- schema membership,
- review history,
- source lineage.

## Nocturne Memory Reference Boundary

`Nocturne Memory` is useful as a reference for:

- snapshot history,
- review workflow,
- boot anchors for high-salience memory,
- explicit metadata around recall conditions.

It is not the primary structure for this app because:

- the product must stay graph-first,
- the user explicitly does not want URI-first memory navigation,
- the memory model should be neuroscience-first, not path-first.

## Testing Strategy

### Backend

- migration tests for new memory tables and columns,
- knowledge runtime bootstrap tests using bundled path resolution,
- knowledge indexing/search integration tests,
- workflow runtime tests that prove provider-backed execution,
- memory event hook tests,
- candidate review tests,
- activation and suppression logic tests.

### Frontend

- `Chat` blocked/ready state tests,
- `Workflow` blocked/ready state tests,
- `MemoryReviewDock` behavior tests,
- `KnowledgePage` tests for real engine state contracts,
- `MemoryPage` tests for activation/consolidation/schema view switching.

### Packaging Verification

- packaged app startup test with no provider configured,
- packaged app knowledge rebuild/search smoke test,
- provider configuration smoke test,
- post-provider `Chat` and `Workflow` smoke test.

## Rollout Sequence

1. app bootstrap and capability state,
2. bundled `PageIndex` and real knowledge search,
3. provider gate normalization across surfaces,
4. workflow runtime hardening,
5. memory schema migration and event hooks,
6. inline review dock in chat/workflow,
7. memory page activation/consolidation upgrade,
8. packaging verification and documentation.

## References

- `Nocturne Memory` repository: https://github.com/Dataojitori/nocturne_memory
- `Nocturne Memory` MCP tools reference: https://raw.githubusercontent.com/Dataojitori/nocturne_memory/main/docs/TOOLS.md
- Squire LR, Genzel L, Wixted JT, Morris RGM. *Memory consolidation*. 2015. PubMed: https://pubmed.ncbi.nlm.nih.gov/26238360/
- Robin J, Moscovitch M. *A contextual binding theory of episodic memory: systems consolidation reconsidered*. 2019. PubMed: https://pubmed.ncbi.nlm.nih.gov/30872808/
- Audrain S, McAndrews MP. *Schemas provide a scaffold for neocortical integration of new memories over time*. 2022. PubMed: https://pubmed.ncbi.nlm.nih.gov/36184668/
- Guo D, Chen G, Yang J. *Effects of schema on the relationship between post-encoding brain connectivity and subsequent durable memory*. 2023. PubMed: https://pubmed.ncbi.nlm.nih.gov/37253795/
- Trelle AN et al. *Hippocampal and cortical mechanisms at retrieval explain variability in episodic remembering in older adults*. 2020. PubMed: https://pubmed.ncbi.nlm.nih.gov/32469308/
- Horner AJ et al. *Evidence for holistic episodic recollection via hippocampal pattern completion*. 2015. Nature Communications: https://www.nature.com/articles/ncomms8462
- Kastellakis G et al. *Linking Memories across Time via Neuronal and Dendritic Overlaps in Model Neurons with Active Dendrites*. 2016. PubMed: https://pubmed.ncbi.nlm.nih.gov/27806290/
- Wu JQ et al. *The hippocampus, medial prefrontal cortex, and selective memory retrieval: evidence from a rodent model of the retrieval-induced forgetting effect*. 2014. PubMed: https://pubmed.ncbi.nlm.nih.gov/24753146/
- Ranganath C, Cohen MX, Brozinsky CJ. *Working memory maintenance contributes to long-term memory formation: neural and behavioral evidence*. 2005. PubMed: https://pubmed.ncbi.nlm.nih.gov/16102232/
- Daume J et al. *Persistent activity during working memory maintenance predicts long-term memory formation in the human hippocampus*. 2024. PubMed: https://pubmed.ncbi.nlm.nih.gov/39406238/
