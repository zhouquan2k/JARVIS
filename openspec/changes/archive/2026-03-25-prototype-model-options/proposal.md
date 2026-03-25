## Why

当前聊天流程只能让用户选择 Provider 和模型，不能根据具体模型暴露“联网搜索”“Deep Research”这类模型特定功能，导致 ChatGPT 与 Gemini 已具备但能力形态不同的功能无法被统一配置、持久化和透传。现在补齐这层契约，可以在不破坏现有普通聊天流程的前提下，把模型能力选择从实现细节提升为产品能力。

## What Changes

- 为模型目录增加“模型功能选项”元数据，用统一契约描述当前模型支持哪些布尔型能力、默认值以及冲突关系。
- 为普通聊天会话增加模型配置持久化能力，保存当前会话的 `providerId`、`modelId` 与已启用的模型功能选项。
- 在普通聊天输入区增加动态功能开关区，仅展示当前模型支持的功能项，并在切换模型时自动清理不兼容选项。
- 扩展 Provider 发送契约，把模型功能选项随消息一起传入 Provider，由 ChatGPT 与 Gemini Provider 分别翻译为各自请求参数。
- 首期仅覆盖普通聊天视图，不扩展 Compare、外部历史导入或消息级功能回显。

## Capabilities

### New Capabilities
- 无

### Modified Capabilities
- `core-interfaces`: 扩展模型目录和 `sendMessage` 契约，使模型功能选项可以在 runtime、UI 和 provider 之间传递。
- `conversation-workspace`: 让普通聊天视图根据当前模型展示动态功能开关，并在会话切换时恢复已保存的模型配置。
- `storage-provider`: 要求存储层无损保存和读取会话级模型选择与功能选项。
- `chatgpt-web-provider`: 支持将 ChatGPT 的联网搜索与 Deep Research 选项翻译为请求行为，并处理冲突能力。
- `gemini-api-provider`: 支持将 Gemini 的 Deep Research 选项翻译为请求行为。

## Impact

- 影响 `packages/core` 中的模型目录、Provider 接口与会话数据模型。
- 影响 `packages/ui` 中普通聊天页、聊天 store 以及模型选择相关交互。
- 影响 `ChatGPTWebProvider`、`GeminiApiProvider` 的请求构建逻辑与对应单测。
- 需要补充会话恢复、模型切换、冲突选项和 Provider 透传相关测试用例。
