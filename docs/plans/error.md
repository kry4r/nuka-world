# Nuka World Desktop 状态说明

## 本轮已修正的问题

### Settings
- Provider 不再内置，改为用户在界面里手动配置。
- Providers / Appearance / Runtime 已接入真实保存逻辑，刷新或重启后仍可恢复。
- Provider 卡片可点击查看和编辑，连接测试走真实后端命令。
- 右侧无用的 `Section Guide` 已移除。

### Knowledge
- 空库时展示诚实空态，不再渲染伪造的 external connector 文本。
- 本地文件夹 connector、索引重建、搜索结果都来自真实后端。
- 右侧 inspector 现在展示真实 library / connector / extension / engine 信息。

### Memory
- 移除了纯装饰性的假图结构，改为真实 memory scope 列表与 detail 视图。
- 支持按 workflow id 查询 memory。
- detail 面板展示真实 workflow、session、agent 元数据。

### Chat / Workflow / Agents / Shell
- Chat 使用真实 provider/session 流程，不再展示伪造 welcome copy。
- Workflow 可以启动真实 session，并带上 workflow inputs。
- Agents 支持真实 CRUD 与 draft 生成。
- 左侧边栏已移除收起按钮，Settings 并入主导航，页面切换具备过渡动画。

## 当前首版边界

- Provider 仅支持 `OpenAI-compatible`。
- 需要用户手填 `base URL`、`token`、`model name`。
- 暂不支持 `Anthropic`。
- Knowledge 仅支持本地文件夹 connector。
- 首个可替换引擎为 `PageIndexEngine`。
- 索引/检索进程由 Nuka World 负责本地拉起和管理。

## Knowledge 文件类型支持

当前支持：

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

## 手工验证建议

1. 在 `Settings` 里新增一个 OpenAI-compatible provider，并设为默认。
2. 在 `Chat` 里发送一条消息，确认 session/provider 信息真实更新。
3. 在 `Workflow` 里启动一个已保存 workflow，确认输入与 session 状态可见。
4. 在 `Agents` 里创建或保存一个 agent，确认列表与详情同步。
5. 在 `Knowledge` 里添加本地文件夹，重建索引，再执行一次搜索。
6. 在 `Memory` 里按 workflow id 查询，确认 detail 展示 workflow/session/agent 元数据。
7. 重启应用后再次检查 settings/provider/workflow 等状态是否仍然存在。
