<p align="center">
  <img src="./docs/logo/goodlogo.png" alt="Nuka World" width="156">
</p>

<h1 align="center">Nuka World Desktop</h1>

<p align="center">
  一个基于 <code>Rust</code>、<code>Tauri 2</code>、<code>React</code> 与 <code>TypeScript</code> 构建的 desktop-first AI 工作台。
</p>

## 当前已落地能力

Nuka World 现在已经接入真实桌面后端链路，不再保留页面级伪成功路径：

- `Bootstrap`：启动时初始化 SQLite、运行时状态，以及打包内置的 `PageIndex` 入口。
- `Chat`：走真实 provider 回复链路；未配置默认 provider 时会被真实阻塞。
- `Workflow`：使用真实 provider 启动与继续 workflow session，并保留来自 chat 的 handoff 来源。
- `Agents`：真实加载与保存 agent；`Agent draft` 同样严格依赖默认 provider。
- `Knowledge`：首启自动创建默认 library，使用内置 `PageIndex` 做本地重建和索引搜索。
- `Memory`：继续保持 graph-first，并加入 `working`、`episodic`、`semantic` 三类痕迹、候选审核以及 activation / consolidation / schema 视图。

## 首次使用

1. 启动应用。
2. 确认外壳状态显示 `Knowledge ready`。
3. 打开 `Settings`。
4. 新增一个 OpenAI-compatible provider，执行连接测试，并设为默认 provider。
5. 回到 `Chat`、`Workflow` 或 `Agents`。
6. 在聊天或 workflow 输入区上方的 memory review dock 中审核待处理记忆候选。

## Provider Gate

Provider 依赖是严格生效的：

- `Chat`：未配置默认 provider 前不可用。
- `Workflow`：未配置默认 provider 前，启动与继续操作都会被阻塞。
- `Agent draft`：未配置默认 provider 前不可用。
- `Knowledge`：不依赖 provider，因为搜索运行时已随应用打包。
- `Memory`：无 provider 也可浏览，但只有真实 chat / workflow 事件发生后才会产生新的候选记忆。

## Knowledge 运行时

桌面打包版本会在 bootstrap 阶段，从 Tauri resources 中解析 `resources/pageindex/pageindex.cmd`。
如果该资源缺失，应视为打包缺陷，而不是让用户额外安装本地运行时。

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

## Memory 模型

Memory 继续保留现有 graph 交互形态，并增加神经机制优先的状态语义：

- `Working`：短时激活上下文。
- `Episodic`：来自 session 或 workflow 事件的情景痕迹。
- `Semantic`：经过审核后沉淀的长期语义记忆。
- 底部审核 dock 三选：`转入长期语义记忆`、`暂留为情景记忆`、`拒绝`。
- `Memory` 页面支持 `Activation`、`Consolidation`、`Schema` 三种视图。

语义记忆不会静默提升。运行时只能生成候选，是否进入长期语义记忆必须经过用户审核。

## 当前范围边界

- Provider 目前只支持 `OpenAI-compatible`。
- 仍需用户手动填写 `base URL`、`token`、`model name`。
- 暂未实现 `Anthropic`。
- Knowledge connector 目前只支持本地文件夹。
- 当前打包的 PageIndex 入口是 Windows `pageindex.cmd` 资源。
- 本地索引与检索生命周期仍由 Nuka World 自己管理。

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
- 若要使用 `Chat`、`Workflow` 或 `Agent draft`，需要一个可访问的 OpenAI-compatible 接口
- 打包桌面应用不再要求单独安装 PageIndex

## 常用开发命令

```bash
npm.cmd --prefix apps/desktop ci
cargo test --workspace
npm.cmd --prefix apps/desktop test
npm.cmd --prefix apps/desktop run build
```

## 许可证

本项目采用 `Apache-2.0` 许可证，详见 `LICENSE`。
