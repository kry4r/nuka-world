<p align="center">
  <img src="./docs/logo/goodlogo.png" alt="Nuka World" width="156">
</p>

<h1 align="center">Nuka World Desktop</h1>

<p align="center">
  A desktop-first AI workspace built with <code>Rust</code>, <code>Tauri 2</code>, <code>React</code>, and <code>TypeScript</code>.
</p>

## What ships now

Nuka World now runs real desktop backend flows instead of placeholder success paths:

- `Bootstrap` initializes SQLite, runtime status, and the bundled `PageIndex` entrypoint on launch.
- `Chat` sends provider-backed turns and stays truthfully blocked until a default provider exists.
- `Workflow` starts and continues real provider-backed workflow sessions, including chat handoff origins.
- `Agents` loads and saves real records; `Agent draft` is also blocked until a default provider exists.
- `Knowledge` creates the default library automatically, rebuilds indexes locally, and searches indexed snippets through bundled `PageIndex`.
- `Memory` stays graph-first with `working`, `episodic`, and `semantic` traces, inline candidate review, and activation, consolidation, or schema views.

## First run

1. Launch the app.
2. Confirm the shell reports `Knowledge ready`.
3. Open `Settings`.
4. Add an OpenAI-compatible provider, test the connection, and mark it as default.
5. Return to `Chat`, `Workflow`, or `Agents`.
6. Review pending memory candidates from the dock above the chat or workflow composer.

## Provider gate

The provider requirement is strict:

- `Chat` is blocked until a default provider is configured.
- `Workflow` start and follow-up actions are blocked until a default provider is configured.
- `Agent draft` is blocked until a default provider is configured.
- `Knowledge` remains available without a provider because the search runtime is local and bundled.
- `Memory` remains available without a provider, but new candidates only appear after real chat or workflow runtime events.

## Knowledge runtime

The packaged desktop app resolves `resources/pageindex/pageindex.cmd` from Tauri resources during bootstrap.
If that resource is missing, knowledge rebuild and search failures should be treated as packaging defects, not as user setup work.

Supported local file types:

- `pdf`
- `md`
- `markdown`
- `txt`
- `json`
- `yaml`
- `yml`
- `rs`
- `ts`
- `tsx`
- `py`

## Memory model

The memory system keeps the existing graph interaction model and adds neuroscience-informed state:

- `Working` traces for short-lived active context.
- `Episodic` traces for session or workflow events.
- `Semantic` traces for reviewed long-term knowledge.
- Inline review dock actions: `转入长期语义记忆`, `暂留为情景记忆`, `拒绝`.
- `Activation`, `Consolidation`, and `Schema` views on the Memory page.

Semantic promotion is never silent. The runtime can propose candidates, but the user must review them before they become durable semantic memory.

## Current boundaries

- Provider support is `OpenAI-compatible` only.
- Users must still enter `base URL`, `token`, and `model name` themselves.
- `Anthropic` is not implemented yet.
- Knowledge connectors support local folders only.
- The packaged PageIndex entrypoint is currently the Windows `pageindex.cmd` resource.
- Nuka World owns the local indexing and retrieval lifecycle.

## Workspace layout

```text
apps/
  desktop/
    src/
    src-tauri/
crates/
  nuka-domain/
  nuka-runtime/
  nuka-storage/
  nuka-memory/
  nuka-knowledge/
  nuka-tools/
  nuka-integrations/
docs/
  images/
  logo/
  plans/
```

## Requirements

- Rust toolchain
- Node.js
- Tauri desktop prerequisites for your platform
- A reachable OpenAI-compatible endpoint if you want to use `Chat`, `Workflow`, or `Agent draft`
- No separate PageIndex installation for the packaged desktop app

## Development commands

```bash
npm.cmd --prefix apps/desktop ci
cargo test --workspace
npm.cmd --prefix apps/desktop test
npm.cmd --prefix apps/desktop run build
```

## License

This project is licensed under the `Apache-2.0` License. See `LICENSE` for details.
