## Why

知识工作区中的 Agent 对话会在多轮交互中不断补充当前文档的问题定义与解决方案，但这些新增信息目前停留在聊天记录里，无法稳定沉淀回文档。我们需要一个快速归档动作，把当前 Agent 对话合并回当前选中的 Markdown Q/A 文档，同时继续复用现有文件变更历史，以便用户查看 diff 并随时撤销。

## What Changes

- 增加一个一键归档动作，仅在 agent 模式下、且当前选中节点就是活动的可写 Markdown 文档时可用。
- 归档时处理当前可见对话的完整范围，并按文档中的首个 Markdown 标准分割线拆分 `Q` / `A`。
- 将用户消息重写为更精炼的结构化 `Q`，将助手消息整理为去重后的结构化 `A`，并以最新内容优先。
- 不再要求预览确认，点击后直接写回文档。
- 归档写回必须经过现有工作区文件变更链路，从而继续支持 line diff、undo、redo。
- 在聊天区反馈归档成功、无改动和失败状态，但不打断当前对话视图。
- 在当前对话上持久化归档状态，使工作区能够判断该对话是否已经归档。
- 在聊天 UI 中显示持久化的归档状态，让用户看到当前对话是已归档、因新消息而过期，还是从未归档。

## Capabilities

### New Capabilities
- `conversation-document-archive`：将当前 Agent 对话归档到当前 Markdown Q/A 文档，并让结果继续支持工作区文件历史中的撤销与重做。

### Modified Capabilities
- `knowledge-workspace`：增加与当前选中 Markdown 文档绑定的归档可用性规则，并要求归档写回进入工作区 diff 与 undo/redo 流程。
- `conversation-workspace`：增加 agent 模式下的归档入口，在本地对话上持久化归档状态，并在聊天工作区 UI 中展示该状态。

## Impact

- 主要影响 `packages/ui` 中的普通聊天视图、chat store、document workspace store。
- 影响 `packages/core` 中的对话持久化契约与本地会话存储流程，因为归档状态需要跨重载保留。
- 新增一个归档编排服务，用于 Q/A 拆分、归档 prompt 构造和结果合成。
- 复用现有模型选择、上下文文档读写和文件变更历史基础设施，不新增服务端 API。
