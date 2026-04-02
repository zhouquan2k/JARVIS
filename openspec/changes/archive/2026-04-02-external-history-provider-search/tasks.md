## 1. 核心接口与协议扩展

- [x] 1.1 扩展 `packages/core/src/interfaces/IHistoryProvider.ts`，为 `getHistoryList(...)` 增加 `HistoryListQueryOptions`，并为 `ExternalHistoryProviderEntry` 增加历史搜索 capability 字段。
- [x] 1.2 扩展 `apps/desktop/shared/proxyProtocol.ts` 与 `apps/extension/src/utils/proxyProtocol.ts` 的 `GetHistoryListRequest`，支持透传可选 `query`。
- [x] 1.3 更新 `apps/desktop/src/utils/DesktopHistoryProxy.ts`、`apps/extension/src/utils/BackgroundHistoryProxy.ts`、`apps/desktop/main/providerHost.ts` 和 `apps/extension/entrypoints/background.ts`，让 `GET_HISTORY_LIST` 在 renderer 到 host/background 全链路透传 `query`。

## 2. 共享工作台搜索交互

- [x] 2.1 新增 `packages/ui/src/components/ExternalHistorySearchBox.vue`，实现共享搜索输入、清空、提交与 loading 展示。
- [x] 2.2 更新 `packages/ui/src/store/chat.ts`，新增共享 `externalHistoryQuery` / `externalHistoryQuerySubmitted` 状态及 `setExternalHistoryQuery(...)`、`submitExternalHistoryQuery(...)`、`clearExternalHistoryQuery(...)`。
- [x] 2.3 更新 `packages/ui/src/components/ConversationSidebar.vue` 与 `packages/ui/src/views/ConversationWorkspaceView.vue`，在支持搜索的外部 provider 下渲染共享搜索框，并在 provider 切换时沿用当前 query 重查结果。
- [x] 2.4 更新 `apps/web/src/providerRuntime.ts`、`apps/desktop/src/providerRuntime.ts`、`apps/extension/src/providerRuntime.ts`，为 `chatgpt-web` 与 `gemini-web` 声明 `historySearch` capability，并确保 `external-file` 不显示搜索框。

## 3. ChatGPT 外部历史搜索

- [x] 3.1 扩展 `packages/core/src/providers/model/ChatGPTWebProvider.ts` 的 `getHistoryList(...)`，保持空 query 返回最近列表。
- [x] 3.2 在 `ChatGPTWebProvider` 中实现非空 query 的历史搜索路径，并继续将结果标准化为 `ConversationHistorySummary[]`。
- [x] 3.3 为 ChatGPT 历史搜索补充单测，覆盖空 query、非空 query 和结果标准化行为。

## 4. Gemini 外部历史搜索

- [x] 4.1 扩展 `packages/core/src/providers/history/gemini/GeminiHistoryBridge.ts`、`GeminiDomHistoryProvider.ts` 与 `geminiContentProtocol.ts`，让 Gemini 历史列表查询支持可选 `query`。
- [x] 4.2 更新 `packages/core/src/interfaces/ProviderRemoteConfig.ts` 与 `apps/server/src/provider-configs/gemini-history.json`，新增 Gemini 搜索输入、提交、清空与结果项的可选 selectors。
- [x] 4.3 更新 `apps/desktop/main/GeminiHistoryPageBridge.ts` 与 `apps/desktop/main/gemini-history.preload.ts`，实现 desktop Gemini 搜索输入、结果稳定等待与摘要提取。
- [x] 4.4 更新 `apps/extension/entrypoints/gemini-history.content.ts`，实现 extension Gemini 搜索输入、结果稳定等待与摘要提取。
- [x] 4.5 为 Gemini core bridge、desktop preload 和 extension content script 补充测试，覆盖空 query、非空 query、空结果与标准错误映射。

## 5. 回归验证与 E2E

- [x] 5.1 更新 `packages/ui/src/store/chat.test.ts` 与 `packages/ui/src/components/ConversationSidebar.test.ts`，覆盖共享 query、provider 切换重查、清空后回到最近列表及 `external-file` 隐藏搜索框。
- [x] 5.2 更新 desktop / extension 代理相关测试，验证 `GET_HISTORY_LIST` 带 `query` 时的透传、回包与错误处理行为。
- [x] 5.3 运行 `pnpm lint`、`pnpm exec tsc --noEmit` 及相关 build，确认接口和类型改动无回归。
- [x] 5.4 补充并运行 Playwright 用例，覆盖 ChatGPT / Gemini 外部历史搜索输入、provider 切换沿用共享 query、搜索结果预览与导入链路。
- [x] 5.5 对 extension Playwright 用例申请提权并使用 `channel: 'chromium'` 运行；通过后执行 `pnpm --filter extension build`。
