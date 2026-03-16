## 1. 核心契约与持久化

- [x] 1.1 扩展 `packages/core/src/interfaces/IStorageProvider.ts` 中的 `ConversationMessage`，加入 `questionId`、`starred`、`deleted`、`createdAt` 等字段，并补充对应 clone/normalize 逻辑。
- [x] 1.2 更新 `packages/core/src/providers/IndexedDBStorageProvider.ts` 及其测试，验证问题索引元数据在本地保存、读取和旧数据兼容路径中无损保留。
- [x] 1.3 更新 `packages/core/src/providers/SyncStorageProvider.ts`、`apps/server/src/types/sync.ts` 及相关测试，确保消息级问题元数据在 push、pull、hydrate 中被保留且不与会话级删除混淆。

## 2. 聊天 Store 与发送流程

- [x] 2.1 重构 `packages/ui/src/store/chat.ts`，把输入草稿提升到 store，新增 `draftPrompt`、`lastSubmittedPrompt`、问题索引派生状态和相关 action。
- [x] 2.2 在 `chat.ts` 的发送流程中生成稳定的 `questionId`，让用户消息与对应助手消息共享同一分组标识，并保持既有远端会话续聊语义不受消息级软删除影响。
- [x] 2.3 实现问题级星标与软删除逻辑，确保操作后会话被统一保存，且旧消息缺失 `questionId` 时存在可回退的配对规则。
- [x] 2.4 实现停止生成后的草稿回填与焦点恢复逻辑，替换现有仅调用 `provider.abort()` 的中断行为。

## 3. 工作台与问题索引界面

- [x] 3.1 新增 `packages/ui/src/components/QuestionIndexPanel.vue`，实现问题列表、全部/仅看星标筛选、hover 操作区和内联删除确认交互。
- [x] 3.2 改造 `packages/ui/src/views/ConversationWorkspaceView.vue`，在普通聊天活动态接入右侧问题索引面板，并在对比模式或外部预览态隐藏该面板。
- [x] 3.3 改造 `packages/ui/src/views/NormalChatView.vue`，为问题根节点输出滚动锚点并实现索引点击后的平滑滚动、滚动过程中的活跃问题高亮同步。
- [x] 3.4 调整 `packages/ui/src/views/NormalChatView.vue` 的输入键盘行为为 `Enter` 换行、`Ctrl/Cmd + Enter` 发送，并增加可见的快捷键提示与停止按钮文案。
- [x] 3.5 为主线程中的已星标问答对添加联动视觉反馈，并补充删除后的收缩/淡出过渡样式。

## 4. 测试与验证

- [x] 4.1 补充 `packages/ui/src/store/chat.test.ts`，覆盖问题索引派生、星标切换、本地软删除过滤、停止回填和旧消息回退逻辑。
- [x] 4.2 补充共享 UI 组件测试，验证 `QuestionIndexPanel` 的筛选、删除确认和索引高亮行为。
- [x] 4.3 新增或更新 `apps/web/tests/e2e` 下的 Playwright 用例，覆盖快捷键发送、停止回填、问题索引滚动联动、星标筛选和软删除后的本地可见过滤。
- [x] 4.4 如需覆盖扩展宿主行为，补充扩展侧 Playwright E2E，用提权方式运行并使用 `channel: 'chromium'`，通过后执行 `pnpm --filter extension build`。（当前改动未引入扩展宿主特有分支，判定无需单独扩展 E2E）

## 5. 左侧会话删除与跨端硬删除

- [x] 5.1 改造 `packages/ui/src/components/ConversationSidebar.vue` 与 `packages/ui/src/views/ConversationWorkspaceView.vue`，为本地历史项增加仅在 hover / focus 时显示的“删除”按钮和轻量确认交互，并确保外部历史列表不暴露该入口。
- [x] 5.2 扩展 `packages/ui/src/store/chat.ts`，新增 `deleteLocalConversation(id)` 或等价 action，统一处理当前会话删除后的选中回退逻辑。
- [x] 5.3 更新 `packages/core/src/providers/IndexedDBStorageProvider.ts` 及相关测试，使左侧历史触发的整会话删除执行本地硬删除而不是保留 tombstone。
- [x] 5.4 更新 `packages/core/src/providers/SyncStorageProvider.ts`、`apps/server/src/types/sync.ts`、`apps/server/src/services/syncService.ts`、`apps/server/src/repositories/syncRepository.ts` 及相关测试，引入独立删除事件流并支持服务端物理删除。
- [x] 5.5 新增或更新 Web E2E 与同步测试，覆盖左侧会话删除、当前会话删除后的回退选择，以及删除结果在多端 pull 后不再回流。
