## 1. 核心契约与持久化

- [x] 1.1 扩展 `packages/core/src/interfaces/Conversation.ts`，新增可选 `documentPaths` 字段，并更新 `cloneConversation` / `normalizeConversation` 的兼容逻辑
- [x] 1.2 扩展 `packages/core/src/interfaces/IContextProvider.ts`，新增 `getConversations(query: ConversationQuery): Promise<Conversation[]>` 契约，并补齐相关导出
- [x] 1.3 更新本地存储与同步相关类型，使 `documentPaths` 在读取、保存和旧数据兼容路径下无损保留

## 2. Context Provider 与服务端接口

- [x] 2.1 为 `packages/core/src/providers/context/HttpContextProvider.ts` 增加 `getConversations(query)` 的 HTTP 调用实现
- [x] 2.2 为 `packages/core/src/testing/createMockContextProvider.ts` 增加基于 `documentPaths` 的会话查询实现，并支持 `documentPath` 条件供 UI 单测使用
- [x] 2.3 更新 `apps/server/src/services/httpContextService.ts` 与 `apps/server/src/routes/context.ts`，暴露 `/api/context/get-conversations` 对应的会话查询 endpoint
- [x] 2.4 更新服务端同步载荷与仓储透传实现，使 `documentPaths` 在 push / pull 和聚合持久化中被完整保留

## 3. AgentPane 列表/详情交互

- [x] 3.1 在 `packages/ui/src/store/chat.ts` 中补充首轮真实附件写入 `documentPaths` 的逻辑，并保持后续轮次不自动改绑
- [x] 3.2 新增 `packages/ui/src/components/AgentConversationPanel.vue`，实现文档选中时默认列表、目录选中时详情、以及顶部 `+ / 返回 / 标题` 导航
- [x] 3.3 新增 `packages/ui/src/components/AgentDocumentConversationList.vue`，渲染当前文档的关联会话列表和“进入详情”交互
- [x] 3.4 修改 `packages/ui/src/components/AgentPane.vue`，将现有 `NormalChatView` 直挂结构替换为 `AgentConversationPanel`，同时保留现有 Agent 头部信息

## 4. 自动化验证

- [x] 4.1 补充 `packages/ui/src/store/chat.test.ts`、`packages/ui/src/components/AgentPane.test.ts` 以及 provider / 服务端相关单测，覆盖 `documentPaths`、`getConversations(query)` 与列表/详情状态切换
- [x] 4.2 补充 `apps/web/tests/e2e/knowledge-workspace.spec.ts` 的 Playwright 用例，覆盖选中文档默认列表、进入详情、顶部返回、顶部 `+` 回列表、首轮关联写入和跨文档切换
- [x] 4.3 运行 `pnpm lint`、类型检查、目标测试与 `pnpm build` 完成回归验证；若涉及 extension 路径，再补 `pnpm --filter extension build`

## 5. 对话模式左侧星标与过滤

- [x] 5.1 扩展会话模型与本地/同步持久化链路，为整会话增加可持久化的 `starred` 元数据，并保证旧会话兼容
- [x] 5.2 更新 `packages/ui/src/components/ConversationSidebar.vue`，为本地历史项增加星标切换操作，并保持外部历史列表不显示该操作
- [x] 5.3 更新对话工作台容器与相关 store，引入左侧顶部“全部 / 仅看星标”过滤状态，并让本地历史列表按该状态筛选
- [x] 5.4 补充 `packages/ui/src/components/ConversationSidebar.test.ts`、`packages/ui/src/views/ConversationWorkspaceView.test.ts` 以及持久化相关测试，覆盖星标切换、过滤展示与刷新恢复
- [x] 5.5 运行 `pnpm --filter @packages/ui test -- packages/ui/src/components/ConversationSidebar.test.ts packages/ui/src/views/ConversationWorkspaceView.test.ts`，并按需要补充更大范围回归验证
