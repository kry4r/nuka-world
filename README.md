# Nuka World Desktop Rewrite

This worktree tracks Nuka World as a pure desktop application built with Rust, Tauri 2, React, and TypeScript.

## Product Surface

- Desktop-only application shell
- No legacy Go API server or Next.js web frontend in this worktree
- Local-first runtime with Rust commands behind the Tauri boundary

## Stack

- Rust workspace
- Tauri 2 desktop shell
- React + TypeScript + Vite UI
- SQLite-backed local data flow

## Structure

```text
apps/
  desktop/
    src/
    src-tauri/
crates/
```

## Development

```bash
cargo test --workspace
npm.cmd --prefix apps/desktop test
npm.cmd --prefix apps/desktop run build
```
