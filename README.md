<p align="center">
  <img src="./docs/logo/goodlogo.png" alt="Nuka World" width="168">
</p>

<h1 align="center">Nuka World Desktop</h1>

<p align="center">
  一个 <strong>desktop-first</strong> 的 AI 工作台，基于 <code>Rust</code>、<code>Tauri 2</code>、<code>React</code> 与 <code>TypeScript</code> 构建，
  将聊天、工作流、Agent、记忆、知识库与运行时控制整合到一个本地优先的桌面空间里。
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
  <strong>World Chat 为核心 · 多页面桌面工作流 · Local-first Runtime · 轻量但可扩展</strong>
</p>

---

## ✨ 当前产品概览

Nuka World 当前围绕 `World Chat` 展开，并提供一组面向桌面 AI 工作流的主页面：

- `Chat`：空态品牌引导、药丸式输入、进入会话后的对话与上下文检查器
- `Workflow`：面向房间/模板的任务组织方式
- `Agents`：一句话创建与工具绑定的 Agent 预设入口
- `Memory`：图式、多层级、可切换主体的记忆视图
- `Knowledge`：外部知识库接入、分层与分块组织
- `Settings`：`Providers / Appearance / Runtime` 的可编辑表单状态

---

## 🧭 Light Architecture

<p align="center">
  <img src="./docs/images/architecture-light.svg" alt="Nuka World Light Architecture" width="100%">
</p>

这张架构图对应当前仓库的真实分层：

- 顶层是 `React + TypeScript` 的桌面 UI 表面
- 中间是 `Tauri Shell`，负责窗口生命周期、托盘与命令桥接
- 底层是 Rust workspace 中的 `domain / runtime / storage / memory / knowledge / tools / integrations`
- 最下方是本地持久化、Provider 配置、文件 I/O 与桌面系统能力

---

## 🧩 Feature Map

<p align="center">
  <img src="./docs/images/feature-map-light.svg" alt="Nuka World Feature Map" width="100%">
</p>

这张功能图聚焦当前已经落地的产品面：

- `World Chat` 是中心入口
- `Workflow / Agents / Memory / Knowledge / Settings` 作为环绕式工作台模块
- 所有页面都围绕一个 desktop-first 的统一 shell 和本地运行时组织

---

## 🏗 Runtime Model

- `Local-first desktop shell`：以 `Tauri 2` 提供原生窗口、托盘与桌面生命周期
- `Rust workspace`：承载领域模型、运行时编排、存储、记忆、知识、工具与集成能力
- `React application`：负责页面编排、表单状态、聊天视图与桌面交互体验
- `SQLite foundation`：为会话、模板与配置提供本地持久化基础
- `Tray-resident behavior`：支撑长生命周期桌面运行流程

---

## 📦 仓库状态

当前主代码树已经统一为：

- `Rust + Tauri + React + TypeScript`
- 旧的 Go 后端入口、运行时代码与历史 Next.js Web App 已从活跃产品树中移除
- `docs/plans/` 中保留了当前重写过程的计划文档，作为实现上下文
- 当前品牌源图使用 `docs/logo/goodlogo.png`

---

## 🗂 Workspace Layout

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
```

---

## 🛠 Development Commands

```bash
cargo test --workspace
npm.cmd --prefix apps/desktop test
npm.cmd --prefix apps/desktop run build
```

---

## 🎨 UI Notes

- 大尺寸品牌展示使用 `goodlogo.png`
- 紧凑侧边栏场景保留了更简洁的小尺寸标识
- `Settings` 已不再是静态展示，而是可编辑的桌面表单状态
- 整体 README 图示采用 light、偏现代极客风的轻卡片视觉语言

---

## 📄 License

This project is licensed under the `Apache-2.0` License. See `LICENSE` for details.
