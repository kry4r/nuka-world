<p align="center">
  <img src="./docs/logo/goodlogo.png" alt="Nuka World" width="156">
</p>

<h1 align="center">Nuka World Desktop</h1>

<p align="center">
  A desktop-first AI workspace built with <code>Rust</code>, <code>Tauri 2</code>, <code>React</code>, and <code>TypeScript</code>.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/runtime-Tauri%202-E8E2D5?style=flat-square" alt="Tauri 2">
  &nbsp;
  <img src="https://img.shields.io/badge/core-Rust-C7D7B7?style=flat-square" alt="Rust Workspace">
  &nbsp;
  <img src="https://img.shields.io/badge/ui-React%20%2B%20TypeScript-EFE9DC?style=flat-square" alt="React and TypeScript">
  &nbsp;
  <img src="https://img.shields.io/badge/license-Apache--2.0-A5BC8D?style=flat-square" alt="Apache 2.0 License">
</p>

<p align="center">
  <a href="./README.md"><img src="https://img.shields.io/badge/English-1F221D?style=flat-square" alt="English"></a>
  &nbsp;
  <a href="./README.zh-CN.md"><img src="https://img.shields.io/badge/ZH--CN-D9E4CB?style=flat-square&labelColor=F6F3EC&color=C7D7B7" alt="简体中文"></a>
</p>

<p align="center">
  World Chat at the center, with layered desktop surfaces for workflows, agents, memory, knowledge, and runtime control.
</p>

---

## Current Product

Nuka World currently ships as a focused desktop workspace organized around these surfaces:

- `Chat` for prompt-first conversation, empty-state onboarding, and inspector-ready sessions
- `Workflow` for room-based execution and repeatable templates
- `Agents` for one-line preset creation and tool bindings
- `Memory` for graph-style, layered, multi-subject inspection
- `Knowledge` for external sources, chunked ingestion, and layered libraries
- `Settings` for editable `Providers`, `Appearance`, and `Runtime` state

---

## Light Architecture

<p align="center">
  <img src="./docs/images/architecture-light.svg" alt="Nuka World Light Architecture" width="100%">
</p>

The architecture stays intentionally simple:

- `Desktop UI` provides the shell, chat canvas, settings forms, and product surfaces
- `Tauri Shell` handles native lifecycle, tray behavior, and command bridging
- `Rust Workspace` carries domain, runtime, storage, memory, knowledge, tools, and integrations
- `Local Foundations` persist sessions and settings while connecting to providers and local resources

---

## Feature Map

<p align="center">
  <img src="./docs/images/feature-map-light.svg" alt="Nuka World Feature Map" width="100%">
</p>

The feature map reflects the current product shape:

- `World Chat` is the primary entry and conversation surface
- `Workflow`, `Agents`, `Memory`, `Knowledge`, and `Settings` are surrounding workbench modules
- All surfaces live inside the same desktop shell and local-first runtime model

---

## Runtime Model

- `Local-first shell` with `Tauri 2` for native window, tray, and lifecycle control
- `Rust workspace` for orchestration, storage, memory, knowledge, tools, and integrations
- `React application` for routing, editable forms, and desktop interaction patterns
- `SQLite foundation` for local persistence of sessions, templates, and configuration

---

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
  images/
  logo/
  plans/
  design.pen
  readme-diagrams.pen
```

---

## Requirements

- Rust toolchain for the workspace and desktop shell
- Node.js for the React desktop frontend
- Tauri desktop prerequisites for your platform

---

## Installation

```bash
npm.cmd --prefix apps/desktop ci
```

Install the frontend dependencies before running the desktop tests or build.

---

## Development Commands

```bash
cargo test --workspace
npm.cmd --prefix apps/desktop test
npm.cmd --prefix apps/desktop run build
```

---

## License

This project is licensed under the `Apache-2.0` License. See `LICENSE` for details.
