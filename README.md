# Nuka World Desktop

Nuka World is now a desktop-only application built with Rust, Tauri 2, React, and TypeScript.

## Product Surface

- `World Chat` as the primary entrypoint
- `Workflow`, `Agents`, `Memory`, `Knowledge`, and `Settings` as first-class desktop pages
- Local-first runtime behind the Tauri command boundary
- Editable desktop settings for `Providers`, `Appearance`, and `Runtime`

## Repository State

- The active product stack is `Rust + Tauri + React + TypeScript`
- Legacy Go backend entrypoints, runtime packages, and the old Next.js web app have been removed from the main code tree
- Some files under `docs/plans/` still mention the old stack as historical migration context

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
```

## Development

```bash
cargo test --workspace
npm.cmd --prefix apps/desktop test
npm.cmd --prefix apps/desktop run build
```

## Current UI Notes

- Expanded brand lockups use the provided `docs/logo/goodlogo.png` asset
- Compact sidebar states keep a simplified mark for small-size readability
- Settings now persist local editable form state in the desktop UI layer
