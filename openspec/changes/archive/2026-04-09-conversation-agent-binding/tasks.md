## 1. 对话工作台绑定入口

- [x] 1.1 为 `packages/ui/src/components/ConversationSidebar.vue` 增加本地历史项的 Agent 绑定按钮、行内选择面板，以及与现有星标/删除互斥的二级操作态。
- [x] 1.2 为 `packages/ui/src/views/ConversationWorkspaceView.vue` 增加 `contextProvider` 透传、Agent 候选项懒加载、错误态展示和 `bind-local-agent` 事件处理。
- [x] 1.3 在 `apps/web/src/App.vue`、`apps/extension/src/App.vue`、`apps/desktop/src/App.vue` 中把现有 `contextProvider` 传给 `ConversationWorkspaceView`。

## 2. 会话绑定持久化与 Agent 列表联动

- [x] 2.1 在 `packages/ui/src/store/chat.ts` 中新增 `bindConversationToAgent(id, agentKey)`，支持绑定、改绑、解绑并同步更新 `currentConversation`。
- [x] 2.2 复用现有 `resolveConversationAgentKey(...)` 标准化手动绑定结果，保持 `getConversationsByAgent(...)` 过滤规则不变。
- [x] 2.3 验证知识工作区 `AgentPane` 与 `AgentView` 在手动绑定后能立即显示对应会话，解绑后能立即移除。

## 3. 测试与验证

- [x] 3.1 补充 `packages/ui/src/store/chat.test.ts`，覆盖会话绑定、改绑、解绑和当前活动会话同步。
- [x] 3.2 补充 `packages/ui/src/components/ConversationSidebar.test.ts` 与 `packages/ui/src/views/ConversationWorkspaceView.test.ts`，覆盖绑定入口展开、候选项加载、错误态和事件分发。
- [x] 3.3 新增或补充 Web Playwright 用例，验证“普通对话页绑定会话到某个 Agent 后，在知识工作区对应 Agent 列表中可见”的真实链路。
