<p align="center">
  <img src="./docs/logo/goodlogo.png" alt="Nuka World" width="156">
</p>

<h1 align="center">Nuka World Desktop</h1>

<p align="center">
  A desktop-first AI workspace built with <code>Rust</code>, <code>Tauri 2</code>, <code>React</code>, and <code>TypeScript</code>.
</p>

## What ships now

Nuka World now runs real local backend flows instead of placeholder desktop state:

- `Settings` persists providers, appearance, and runtime preferences through Tauri into Rust storage.
- `Chat` sends real prompts through the configured provider and keeps truthful session metadata.
- `Workflow` starts saved workflows with input-aware execution state.
- `Agents` loads saved agents, saves edits, deletes entries, and generates provider-aware drafts.
- `Knowledge` manages local folder connectors, rebuild jobs, and engine-backed search.
- `Memory` shows workflow-linked memory scopes with real workflow, session, and agent metadata.

## Current boundaries

This iteration intentionally keeps a narrow backend surface:

- Provider support is `OpenAI-compatible` only.
- Users must enter `base URL`, `token`, and `model name` themselves.
- `Anthropic` is not implemented yet.
- Knowledge connectors support local folders only.
- The first replaceable knowledge engine is `PageIndexEngine`.
- Nuka World owns the local indexing and retrieval process lifecycle.

## Provider setup

Configure providers from `Settings`:

1. Open `Settings`.
2. Add a provider with a friendly name.
3. Fill in `base URL`, `token`, and `model name`.
4. Save it and mark one provider as the default route.
5. Use `Test Connection` to validate the OpenAI-compatible endpoint.

The first real chat/workflow/agent draft flows require a default provider.

## Knowledge engine expectations

Knowledge indexing is local-first and designed behind a replaceable engine abstraction.
The current engine is PageIndex-backed and expects a compatible local runtime to be available.
If the local runtime is missing, rebuild/search surfaces show a truthful backend error instead of fake success.

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

## Surface behavior

- `Chat`: landing state is centered around the composer; successful sends create or continue a real session.
- `Workflow`: saved workflows can start a fresh execution session with collected inputs.
- `Agents`: cards reflect saved backend state and can open real details.
- `Knowledge`: empty state is honest until a folder connector exists; rebuild/search show real job/result state.
- `Memory`: browse saved scopes directly or filter by workflow id.
- `App shell`: settings lives in the main navigation and page switches animate through a real transition container.

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
- A reachable OpenAI-compatible endpoint
- A local PageIndex-compatible runtime if you want knowledge rebuild/search to succeed

## Development commands

```bash
npm.cmd --prefix apps/desktop ci
cargo test --workspace
npm.cmd --prefix apps/desktop test
npm.cmd --prefix apps/desktop run build
```

## License

This project is licensed under the `Apache-2.0` License. See `LICENSE` for details.
