<p align="center">
  <img src="./docs/logo/goodlogo.png" alt="Nuka World" width="156">
</p>

<h1 align="center">Nuka World Desktop</h1>

<p align="center">
  一个基于 <code>Rust</code>、<code>Tauri 2</code>、<code>React</code> 与 <code>TypeScript</code> 构建的 desktop-first AI 工作台。
</p>

## 当前已落地的真实能力

Nuka World 现在已经接入真实本地后端，而不是占位状态：

- `Settings`：通过 Tauri + Rust 持久化 Providers、Appearance、Runtime。
- `Chat`：通过当前默认 provider 发送真实消息，并保存真实 session 元数据。
- `Workflow`：使用输入参数启动真实 workflow session。
- `Agents`：加载、保存、删除 agent，并生成带 provider 上下文的 draft。
- `Knowledge`：管理本地文件夹 connector、重建索引任务、执行引擎驱动搜索。
- `Memory`：展示按 workflow 关联的 memory scope，以及真实 workflow/session/agent 元数据。

## 当前版本边界

这一版有明确范围约束：

- Provider 只支持 `OpenAI-compatible`。
- 需要用户手动填写 `base URL`、`token`、`model name`。
- 暂不支持 `Anthropic`。
- Knowledge 目前只支持本地文件夹 connector。
- 首个可替换 KnowledgeEngine 为 `PageIndexEngine`。
- 索引与检索进程由 Nuka World 在本地拉起并管理生命周期。

## Provider 配置方式

在 `Settings` 中完成 provider 配置：

1. 打开 `Settings`。
2. 新增一个 provider。
3. 填写 `base URL`、`token`、`model name`。
4. 保存后将其中一个 provider 设为默认路由。
5. 使用 `Test Connection` 检查 OpenAI-compatible 接口是否可达。

首版真实的 Chat / Workflow / Agent draft 流程都依赖默认 provider。

## Knowledge 引擎依赖说明

Knowledge 走本地优先设计，并且放在可替换引擎抽象之后。
当前实现由 PageIndex 驱动，因此若本机没有可用的 PageIndex 兼容运行时，重建索引或搜索会返回真实错误，而不是伪造成功状态。

当前支持的本地文件类型：

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

## 主要页面行为

- `Chat`：落地页围绕中心输入框，发送后会创建或延续真实会话。
- `Workflow`：可对已保存 workflow 发起新的执行 session，并带上输入参数。
- `Agents`：卡片展示真实后端数据，可进入详情并保存。
- `Knowledge`：在没有 connector 时展示诚实空态；重建和搜索展示真实任务/结果状态。
- `Memory`：支持直接浏览 scope，也支持按 workflow id 过滤。
- `App shell`：Settings 已合并进主导航，页面切换带真实过渡容器。

## 工作区结构

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

## 环境要求

- Rust toolchain
- Node.js
- 当前平台所需的 Tauri 依赖
- 一个可访问的 OpenAI-compatible 接口
- 若需要成功执行 Knowledge 重建/搜索，还需要本地可用的 PageIndex 兼容运行时

## 常用开发命令

```bash
npm.cmd --prefix apps/desktop ci
cargo test --workspace
npm.cmd --prefix apps/desktop test
npm.cmd --prefix apps/desktop run build
```

## 许可证

本项目采用 `Apache-2.0` 许可证，详见 `LICENSE`。
