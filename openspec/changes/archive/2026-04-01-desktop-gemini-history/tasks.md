## 1. Core 目录收口

- [x] 1.1 按设计将 `packages/core/src/providers/*`、`packages/core/src/agents/*`、`packages/core/src/runtime/*`、`packages/core/src/workflows/compare/*` 调整到目标目录结构
- [x] 1.2 更新 `packages/core/src/index.ts` 与所有受影响 import，删除旧的 `agent-tools`、`analysis` 等遗留深路径引用
- [x] 1.3 为 `createAgentRuntime`、`createAgentToolExecutor`、`ComparisonAnalyzer`、`CompareWorkflowController` 的路径迁移补充或修正回归测试

## 2. Gemini History 共享内核

- [x] 2.1 在 `packages/core/src/providers/history/gemini/` 下新增 `GeminiHistoryBridge`、`GeminiHistoryConfigLoader`、`GeminiDomHistoryProvider` 及相关 helper 文件
- [x] 2.2 将远程配置、缓存回退、标题回退、消息序列化和错误码逻辑迁入共享内核，并保持 `AUTH_REQUIRED`、`CONFIG_UNAVAILABLE`、`SELECTOR_MISMATCH`、`DETAIL_NOT_FOUND`、`TAB_UNAVAILABLE` 语义不变
- [x] 2.3 为 `GeminiHistoryConfigLoader`、`GeminiDomHistoryProvider` 和共享 Gemini helper 补充单元测试，覆盖远程成功、缓存回退、builtin 回退和详情缺失场景

## 3. Desktop 主进程 Gemini Bridge

- [x] 3.1 扩展 `apps/desktop/main/controlledPageManager.ts` 以支持 `preloadPath`，并新增 `apps/desktop/main/GeminiHistoryPageBridge.ts` 与 `apps/desktop/main/gemini-history.preload.ts`
- [x] 3.2 在 `apps/desktop/main/index.ts`、`apps/desktop/main/providerHost.ts` 中将 `gemini-web` 历史 provider 从占位异常替换为 lazy singleton 共享实现
- [x] 3.3 更新 `apps/desktop/main/authWindow.ts` 与相关测试，使 `gemini-web` 支持 `DEFAULT_GEMINI_HISTORY_PAGE_URL`、固定标题 `登录 Gemini` 和登录窗口关闭后的刷新链路

## 4. Desktop Renderer 恢复交互

- [x] 4.1 在 `packages/ui/src/views/NormalChatView.vue` 与 `packages/ui/src/views/ConversationWorkspaceView.vue` 中加入 `hostRecovery*` props 和 `request-host-recovery` 事件透传
- [x] 4.2 在 `apps/desktop/src/App.vue` 中实现 `requestProviderLogin(providerId: 'chatgpt-web' | 'gemini-web')`，并在 `gemini-web` 外部历史 `AUTH_REQUIRED` 时显示 `登录 Gemini`
- [x] 4.3 为 `apps/desktop/src/App.test.ts` 补充 Gemini 登录入口展示、点击打开登录窗和登录窗关闭后刷新历史列表的测试

## 5. 回归验证

- [x] 5.1 运行 `pnpm --filter desktop test`
- [x] 5.2 运行 `pnpm --filter extension test`
- [x] 5.3 运行 `pnpm --filter desktop build` 与 `pnpm --filter extension build`
