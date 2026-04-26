## 1. 归档编排服务

- [ ] 1.1 新增 `packages/ui/src/services/conversationArchive.ts`，封装 Q/A 拆分、归档 prompt 构造和合并结果生成。
- [ ] 1.2 实现首个分割线识别、`***` 排除，以及当前 Markdown 文档缺失归档边界时自动补 `---`。
- [ ] 1.3 为整段对话归并、已删除消息排除和“无新增内容”判定补 service 层测试。

## 2. Store 集成与归档资格校验

- [ ] 2.1 在 `packages/ui/src/store/chat.ts` 中新增 `canArchiveCurrentConversation()` 和 `archiveCurrentConversationToDocument()`，并复用当前有效 provider/model 选择。
- [ ] 2.2 在 `packages/ui/src/store/documentWorkspace.ts` 中新增 `applyGeneratedDocumentChange(...)`，让归档写回进入现有文件变更历史，而不是绕过它。
- [ ] 2.3 增加 store 测试，覆盖仅 agent 模式执行、当前选中 Markdown 文档校验、归档成功、无改动和失败行为。

## 3. 工作区 UI 与文案反馈

- [ ] 3.1 更新 `packages/ui/src/views/NormalChatView.vue`，仅在满足条件的 agent 模式 Markdown 文档上下文中显示归档动作，并在归档执行中禁用重复点击。
- [ ] 3.2 在 `packages/ui/src/i18n/messages/en.ts` 和 `packages/ui/src/i18n/messages/zh-CN.ts` 中补充归档成功、无改动、自动补分割线和失败提示文案。
- [ ] 3.3 为 `NormalChatView` 增加组件测试，覆盖归档按钮显示条件与动作反馈。

## 4. 验证与端到端覆盖

- [ ] 4.1 增加 Playwright E2E 用例，覆盖将 agent 对话归档到 Markdown 文档，并验证文档内容更新与 diff 可见。
- [ ] 4.2 扩展 E2E 用例，验证 undo 可恢复归档前文档，redo 可恢复归档后结果。
- [ ] 4.3 按要求执行受影响 UI 包的验证流程，包括 lint/typecheck、目标测试和相关 Playwright 流程。

## 5. 归档状态持久化与 UI 状态展示

- [ ] 5.1 扩展本地对话模型与持久化流程，增加归档元数据，记录归档文档路径、归档时间戳，以及用于过期检测的快照标记。
- [ ] 5.2 更新 `packages/ui/src/store/chat.ts`，在归档成功或无改动时持久化归档状态，并随着当前可见对话变化重新计算 `idle` / `archived` / `stale`。
- [ ] 5.3 更新 `packages/ui/src/views/NormalChatView.vue` 与 i18n 文案，在归档动作附近展示持久化归档状态。
- [ ] 5.4 增加单测与组件测试，覆盖归档状态持久化、`stale` 状态迁移、重载行为和状态渲染。
- [ ] 5.5 扩展 Playwright 覆盖，验证持久化归档状态可跨重载保留，并在新一轮对话后从 `archived` 变为 `stale`。
