User: "帮我分析这个项目，并生成README"

        │
        ▼
┌──────────────────────┐
│ 1. Prompt Assembly    │
│ - system prompt       │
│ - chat history        │
│ - tool schema         │
└──────────┬───────────┘
           ▼
┌──────────────────────┐
│ 2. LLM 推理 (Step 1)  │
│ 生成：Thought          │
│      Tool Call?        │
└───────┬──────────────┘
        │Yes
        ▼
┌──────────────────────┐
│ 3. Tool Execution     │
│ - MCP 调用            │
│ - Shell / CodeRunner  │
│ - RAG 检索            │
└───────┬──────────────┘
        ▼
┌──────────────────────┐
│ 4. Observation 注入   │
│ tool result -> context│
└───────┬──────────────┘
        ▼
┌──────────────────────┐
│ 5. LLM 推理 (循环)    │
│ ReAct Loop:           │
│ Thought → Action → Obs│
└───────┬──────────────┘
        │直到完成
        ▼
┌──────────────────────┐
│ 6. Final Answer       │
│ 整合工具结果           │í
└──────────────────────┘
