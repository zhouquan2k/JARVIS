## Why

当前 ChatPrism 的聊天链路仍以纯文本输入、浅色卡片式界面和 provider 私有流式文本直出为主，无法承载文件/图片上传、多模态印证以及 ChatGPT 风格的沉浸式工作区体验。Phase 8 需要把核心接口、provider、扩展代理和共享 UI 一次性拉齐。

## What Changes

- 扩展核心会话与 provider 契约，让消息可携带附件元数据、标准化渲染注解和可持久化的预览信息；上传策略限定为 10MB 以内的 Base64/Inline Data，不引入大文件分片。
- 改造 `ChatGPTWebProvider` 与 `GeminiApiProvider`，支持多模态请求负载，并把 `cite`、`image_group` 等 provider 私有标识清洗为共享的标准化渲染数据。
- 扩展 Extension Background Proxy 协议，使其能够转发编码后的附件与结构化流式更新，保持浏览器插件场景下的跨进程通信可用。
- 重构共享聊天工作区 UI，对齐 ChatGPT Web 的暗色、极简、低干扰风格，并补齐上传入口、拖拽、粘贴、附件预览、图片宫格和引用悬浮信息。
- 重构共享聊天工作区 UI，对齐 ChatGPT Web 的暗色、极简、低干扰风格，并落实“新建聊天分裂按钮 + 模式下拉”“插件侧边栏显示聊天/导入切换、Web 默认隐藏”“正文内联可点击引用”等交互细节。
- 确保本地存储、同步存储和历史恢复链路可以无损保存并重放带附件/注解的会话内容，覆盖 Web 与 Extension 两个宿主。

## Capabilities

### New Capabilities

无

### Modified Capabilities

- `conversation-workspace`: 在已改名后的共享聊天工作区 capability 上扩展视觉结构、暗色主题、附件输入、富消息渲染与预览交互，不再将能力边界限定为历史浏览。
- `core-interfaces`: 扩展 `Conversation`、消息结构和 `IModelProvider`/`IStorageProvider` 契约，支持附件与标准化渲染注解。
- `chatgpt-web-provider`: 支持 ChatGPT Web 多模态消息发送，并在流式响应中标准化 `cite`、`image_group` 等私有标识。
- `gemini-api-provider`: 支持 Gemini Inline Data 附件发送，并复用共享的多模态消息契约。
- `extension-proxy`: 扩展 Background 代理协议，转发附件载荷与结构化流式更新，覆盖插件场景的多模态发送。
- `web-host-app`: 在 Web 宿主中接入新的 `conversation-workspace`，并保证多模态消息恢复与主题入口正确装配。
- `extension-host-app`: 在 Extension 宿主中接入新的 `conversation-workspace`，并补齐跨进程多模态上传链路。

## Impact

- 受影响代码主要位于 `/packages/core/src/interfaces`、`/packages/core/src/providers`、`/packages/ui/src`、`/apps/web/src`、`/apps/extension/src` 与 `/apps/extension/entrypoints`。
- 需要补充和更新核心单测、共享 UI 单测、Web E2E 与 Extension E2E；Extension 验证通过后还需要执行 `pnpm --filter extension build`。
- 该变更为增量兼容设计，但会扩大消息和代理协议的数据结构，后续 specs 需要明确旧会话兼容，以及附件大小、类型与持久化边界约束。
