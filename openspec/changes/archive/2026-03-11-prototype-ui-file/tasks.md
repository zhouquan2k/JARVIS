## 1. 核心契约与数据模型

- [x] 1.1 在 `packages/core/src/interfaces/IStorageProvider.ts` 中提取结构化消息类型，给 `Conversation.messages` 增加 `attachments` 与 `annotations` 支持，并保持旧会话兼容读取。
- [x] 1.2 在 `packages/core/src/interfaces/IModelProvider.ts` 中引入 `SendMessageOptions`、`ProviderStreamUpdate` 与最终返回结果契约，支持附件输入和 `text + annotations` 流式更新。
- [x] 1.3 更新 `packages/core/src/providers/IndexedDBStorageProvider.ts`、`packages/core/src/providers/SyncStorageProvider.ts` 及相关测试，验证结构化消息可被无损保存与恢复。

## 2. Provider 标准化输出

- [x] 2.1 改造 `packages/core/src/providers/ChatGPTWebProvider.ts`，让 `sendMessage` 支持多模态负载组装并输出标准化的 `text + annotations` 快照。
- [x] 2.2 在 `packages/core/src/providers/ChatGPTWebProvider.ts` 中补齐对 `cite`、`image_group` 等私有标识的清洗与标准化转换。
- [x] 2.3 改造 `packages/core/src/providers/GeminiApiProvider.ts`，支持将图片/文件编码为 Gemini `inlineData`/`parts` 结构并输出统一的流式快照。
- [x] 2.4 更新 `packages/core/src/testing/createMockRuntime.ts` 与 provider 单测，使 mock/runtime 测试桩也遵守新的 `text + annotations` 契约。

## 3. Extension 代理与宿主接线

- [x] 3.1 更新 `apps/extension/src/utils/proxyProtocol.ts`、`apps/extension/src/utils/BackgroundProxyProvider.ts`，使代理协议支持附件参数和结构化 `UPDATE` 回包。
- [x] 3.2 改造 `apps/extension/entrypoints/background.ts`，确保 Background 能转发多模态请求并按请求维度回传标准化流式更新。
- [x] 3.3 更新 `apps/web/src/App.vue`、`apps/web/src/providerRuntime.ts`，把共享 `conversation-workspace` 所需的 provider/runtime/store 依赖装配到 Web 宿主入口。
- [x] 3.4 更新 `apps/extension/src/App.vue`、`apps/extension/src/providerRuntime.ts`，把共享 `conversation-workspace` 与 proxy-backed runtime 正确装配到扩展宿主。

## 4. 共享工作区与多模态输入

- [x] 4.1 在 `packages/ui/src/store/chat.ts` 中增加草稿附件状态、大小校验、附件移除与发送时的多模态请求拼装逻辑。
- [x] 4.2 新增附件输入与消息展示组件（如 `AttachmentComposer`、`MessageAttachmentStrip`、`MessageAnnotationLayer`），并在 `packages/ui` 中导出它们。
- [x] 4.3 改造 `packages/ui/src/views/NormalChatView.vue`，接入文件选择、拖拽、粘贴、附件预览、只读导入态与图片预览交互。
- [x] 4.4 改造 `packages/ui/src/views/ConversationWorkspaceView.vue` 与 `packages/ui/src/components/ConversationSidebar.vue`，完成暗色极简工作区布局与紧凑历史列表样式。
- [x] 4.5 更新 `packages/ui/src/components/MarkdownContent.vue` 或相关渲染层，使助手消息能够基于 `annotations` 渲染引用和图片组。

## 5. 验证与交付

- [x] 5.1 更新 `packages/ui/src/store/chat.test.ts`、`packages/core/src/providers/ChatGPTWebProvider.test.ts`、`packages/core/src/providers/GeminiApiProvider.test.ts`，覆盖结构化消息、多模态输入和标准化注解输出。
- [x] 5.2 补充 `apps/web/tests/e2e/normal-chat.spec.ts` 的 Playwright 用例，验证附件输入、暗色线程、引用/图片组渲染和历史恢复。
- [x] 5.3 补充 `apps/extension/tests/e2e/extension-host.spec.ts` 的 Playwright 用例，并在提权环境下使用 `channel: 'chromium'` 验证 extension 多模态链路。
- [x] 5.4 在 extension E2E 通过后执行 `pnpm --filter extension build`，确认扩展构建产物仍可生成。
