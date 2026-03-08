## 1. 核心模型与历史抽象

- [x] 1.1 在 `packages/core/src/interfaces/IHistoryProvider.ts` 新增 `IHistoryProvider`、`ConversationHistorySummary` 和来源类型定义，并从 `packages/core/src/index.ts` 导出
- [x] 1.2 扩展 `packages/core/src/interfaces/IStorageProvider.ts` 中的 `Conversation`，增加 `sourceType`、`externalId` 等导入来源元数据
- [x] 1.3 更新 `packages/core/src/providers/IndexedDBStorageProvider.ts` 相关类型使用，确认新增会话元数据能够无损保存和读取

## 2. ChatGPT 历史读取与标准化

- [x] 2.1 在 `packages/core/src/providers/ChatGPTWebProvider.ts` 增加历史列表读取能力，首版仅获取最近第 1 页历史摘要
- [x] 2.2 在 `packages/core/src/providers/ChatGPTWebProvider.ts` 增加历史详情读取与树转线性标准化逻辑，输出统一的 `Conversation`
- [x] 2.3 为 ChatGPT 历史标准化补充单元测试，覆盖主链提取、过滤非用户/助手节点和缺失标题等场景

## 3. Extension Proxy 与 Background 历史链路

- [x] 3.1 扩展 `apps/extension/src/utils/proxyProtocol.ts`，新增 `GET_HISTORY_LIST`、`GET_HISTORY_DETAIL` 请求与响应类型
- [x] 3.2 新增 `apps/extension/src/utils/BackgroundHistoryProxy.ts`，实现前端历史代理并复用现有请求关联机制
- [x] 3.3 修改 `apps/extension/entrypoints/background.ts`，接入历史列表与历史详情请求路由，并在回包前返回标准化结果
- [x] 3.4 调整 `apps/extension/src/providerRuntime.ts`，为扩展宿主提供历史 provider 注入入口

## 4. UI 工作台与导入流程

- [x] 4.1 新增 `packages/ui/src/views/ConversationWorkspaceView.vue`，实现左侧历史边栏与右侧内容区的 workspace 容器
- [x] 4.2 新增 `packages/ui/src/components/ConversationSidebar.vue`，实现本地记录/外部导入来源切换、侧栏折叠与已导入标识展示
- [x] 4.3 扩展 `packages/ui/src/store/chat.ts`，增加历史 provider、预览态、来源切换、外部详情预览和导入去重逻辑
- [x] 4.4 修改 `packages/ui/src/views/NormalChatView.vue`，在预览态复用消息区并以内联导入按钮替代输入区
- [x] 4.5 评估并调整 `packages/ui/src/views/CompareChatView.vue` 与共享状态交互，确保其可被 workspace 容器稳定承载

## 5. 扩展宿主装配与持久化

- [x] 5.1 修改 `apps/extension/src/App.vue`，将聊天主界面切换为 workspace 容器并保持普通/对比视图切换能力
- [x] 5.2 在扩展宿主初始化流程中同时注入模型 provider、历史 provider 与 `IndexedDBStorageProvider`
- [x] 5.3 实现导入后切换到本地活动会话的闭环，并复用 `backendId` 支持继续追问
- [x] 5.4 校验 `apps/extension/src/persistence/saveCompareConversation.ts` 与相关持久化逻辑，确保新增来源字段不会破坏现有对比会话恢复

## 6. 验证与 Playwright E2E

- [x] 6.1 为 `packages/ui` 或宿主层补充工作台状态与导入判重的单元测试
- [x] 6.2 使用 Playwright 在 `apps/extension/tests/e2e/extension-host.spec.ts` 中新增普通模式下的本地历史展示与切换用例
- [x] 6.3 使用 Playwright 新增外部历史预览、内联导入按钮显示、导入成功后恢复输入区的 e2e 用例
- [x] 6.4 使用 Playwright 新增 workspace 容器下普通/对比视图切换的 e2e 用例，验证历史边栏不会因右侧视图切换而丢失

## 7. Provider 动态模型目录

- [x] 7.1 扩展 `packages/core/src/interfaces/IModelProvider.ts` 与 `packages/core/src/runtime/types.ts`，让 provider 与 runtime 支持返回动态 `models/defaultModel`
- [x] 7.2 更新 `packages/core/src/runtime/createProviderRuntime.ts`，实现 provider 模型目录查询、结果校验、缓存与静态 fallback
- [x] 7.3 在 `packages/core/src/providers/ChatGPTWebProvider.ts`、`GeminiApiProvider.ts` 与 `packages/core/src/testing/createMockRuntime.ts` 中实现 `getAvailableModels()`
- [x] 7.4 扩展 `apps/extension/src/utils/proxyProtocol.ts`、`BackgroundProxyProvider.ts` 与 `apps/extension/entrypoints/background.ts`，新增 `GET_AVAILABLE_MODELS` 链路
- [x] 7.5 改造 `packages/ui/src/store/chat.ts`、`packages/ui/src/store/compare.ts` 以及 `ProviderModelSelector.vue`、`CompareModelSelectors.vue`，让普通聊天和对比聊天等待 provider 返回模型目录后再开放选择
- [x] 7.6 调整 `apps/web/src/App.vue`、`apps/extension/src/App.vue` 初始化流程，并补充 core/UI/web/extension 对应的单测与 E2E 覆盖动态模型目录场景
