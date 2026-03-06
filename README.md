# Nuka World Desktop Rewrite

This worktree contains the in-progress rewrite of Nuka World as a pure desktop application built with Rust, Tauri 2, React, and TypeScript.

## Stack

- Rust workspace
- Tauri 2 desktop shell
- React + TypeScript + Vite UI

## Structure

```text
apps/
  desktop/
    src/
    src-tauri/
```

## Development

```bash
cargo test -p desktop-tauri -- --nocapture
npm --prefix apps/desktop test
```
