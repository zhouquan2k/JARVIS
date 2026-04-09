## 1. 状态快照与恢复基础

- [x] 1.1 在 `/Users/quanzhou/Workspace/JARVIS/packages/ui/src/store/chat.ts` 中新增 `agentViewStatus`，并实现 `saveAgentViewStatus(...)` 与 `restoreAgentViewStatus()`。
- [x] 1.2 调整 `chatStore` 的工作区切换逻辑，移除路由切换时清空 `currentConversation` 的旧行为，保证同一份会话可跨视图复用。
- [x] 1.3 在 `/Users/quanzhou/Workspace/JARVIS/packages/ui/src/store/documentWorkspace.ts` 中新增 `restoreSelection(...)`，支持目录、文件和失效路径回退。

## 2. 视图切换与恢复链路

- [x] 2.1 修改 `/Users/quanzhou/Workspace/JARVIS/packages/ui/src/views/WorkspaceHostApp.vue`，在进入 `/chat` 前保存 Agent 视图状态，并自动折叠左侧历史列表面板。
- [x] 2.2 修改 `/Users/quanzhou/Workspace/JARVIS/packages/ui/src/views/DocumentWorkspaceView.vue`，在返回 Agent 模式时恢复保存的选中节点、活动路径和当前会话详情。
- [x] 2.3 校验 `/Users/quanzhou/Workspace/JARVIS/packages/ui/src/views/ConversationWorkspaceView.vue` 与 `/Users/quanzhou/Workspace/JARVIS/packages/ui/src/views/NormalChatView.vue` 只作为共享会话的辅助展示层，不再触发会话清空。

## 3. 测试与 E2E

- [x] 3.1 补充 `/Users/quanzhou/Workspace/JARVIS/packages/ui/src/store/chat.test.ts`，覆盖 `agentViewStatus` 的保存、恢复和回退语义。
- [x] 3.2 补充 `/Users/quanzhou/Workspace/JARVIS/packages/ui/src/store/documentWorkspace.test.ts` 与相关 view 测试，覆盖节点恢复、文件恢复和失效路径回退。
- [x] 3.3 更新 `/Users/quanzhou/Workspace/JARVIS/packages/ui/src/views/WorkspaceHostApp.test.ts` 与 `/Users/quanzhou/Workspace/JARVIS/packages/ui/src/views/ConversationWorkspaceView.test.ts`，覆盖从 Agent 模式切到对话模式再切回的共享状态链路。
- [x] 3.4 新增 Web Playwright e2e 用例，验证从 Agent 模式进入对话模式后会话详情保持不变、sidebar 自动折叠、返回 Agent 模式后节点与会话状态恢复。
- [x] 3.5 按顺序执行 `pnpm lint`、`pnpm exec tsc --noEmit`、相关单测与 Playwright e2e，确认没有回归。
