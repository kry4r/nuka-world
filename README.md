# Nuka World Desktop

Nuka World is a desktop-first AI workspace built with Rust, Tauri 2, React, and TypeScript.

## Current Product

The current application is centered around `World Chat`, with dedicated desktop surfaces for:

- `Workflow` collaboration rooms
- `Agents` preset creation and tool bindings
- `Memory` graph-style layered memory inspection
- `Knowledge` library and ingestion structure
- `Settings` with editable `Providers`, `Appearance`, and `Runtime`

## Runtime Model

- Local-first desktop shell powered by `Tauri 2`
- Rust workspace for domain, runtime, storage, memory, knowledge, tools, and integrations
- React + TypeScript UI for desktop pages and interaction flows
- SQLite-backed storage foundations in the Rust layer
- Tray-resident desktop behavior for long-running runtime flows

## Repository State

- The main code tree is now `Rust + Tauri + React + TypeScript`
- Legacy Go backend entrypoints, runtime packages, and the old Next.js web app have been removed from the active product tree
- The remaining migration plan documents under `docs/plans/` are kept as historical implementation context
- The selected brand source asset is `docs/logo/goodlogo.png`

## Workspace Layout

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
  design.pen
  logo/
  plans/
```

## Development Commands

```bash
cargo test --workspace
npm.cmd --prefix apps/desktop test
npm.cmd --prefix apps/desktop run build
```

## UI Notes

- Expanded brand lockups use the selected `goodlogo.png` source asset
- Compact sidebar states keep a simplified mark for small-size readability
- Settings persist editable local UI state for providers, appearance, and runtime sections
