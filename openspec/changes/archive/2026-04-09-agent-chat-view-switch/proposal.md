## Why

当前 Agent 模式和对话模式被实现成了两套会互相打断的状态流，切换时会清空或丢失当前会话与节点上下文，导致同一份数据无法稳定地以两种视图展示。现在需要把对话模式明确成 Agent 主视图的辅助视图，让用户能够在不丢失状态的前提下，在 Agent 视角和对话视角之间来回切换。

## What Changes

- 保留 `chatStore.currentConversation` 作为跨视图共享的当前会话，不再在模式切换时清空。
- 在 `chat.ts` 中新增 `agentViewStatus`，用于保存 Agent 主视图的当前选中节点、活动路径和当前会话标识。
- 从 Agent 模式切到对话模式时，显示当前会话详情，并自动折叠左侧历史对话列表。
- 从对话模式切回 Agent 模式时，按保存的 `agentViewStatus` 恢复节点、文档和当前会话详情。
- 对话模式只作为“同一份会话数据的另一种展示方式”，不反向定义 Agent 主视图状态。
- 对失效的保存状态提供安全回退，避免节点或会话被删除后无法返回主视图。

## Capabilities

### Modified Capabilities
- `conversation-workspace`: 对话工作台需要把 `/chat` 视为 Agent 主视图的辅助展示，并在切换时保留、恢复同一份会话状态。
- `knowledge-workspace`: 知识工作区需要在返回 Agent 模式时恢复保存的选中节点、活动路径和当前会话详情。

## Impact

- 受影响代码主要位于 `packages/ui/src/store/chat.ts`、`packages/ui/src/store/documentWorkspace.ts`、`packages/ui/src/views/WorkspaceHostApp.vue`、`packages/ui/src/views/DocumentWorkspaceView.vue` 与 `packages/ui/src/views/ConversationWorkspaceView.vue`。
- Web、Desktop、Extension 三个宿主的工作区切换体验都会受影响，因为它们共享同一套 UI 工作台与状态 store。
- 需要补充对应的 store / view 单测，以及一条覆盖 Agent 模式与对话模式来回切换的 Playwright e2e。
