## Why

当前工作区已经为 ChatGPT Web 请求暴露了统一的 `web_search` 模型选项，但 Gemini API 还没有提供相同的用户侧开关和对应的运行时行为。结果就是，尽管产品表面上提供的是统一模型选项界面，用户仍然需要记住不同 provider 之间的能力差异。

对于 Gemini 来说，平台本身已经提供了原生的 Google Search grounding 工具。本次变更要把 Gemini 纳入与 ChatGPT Web 相同的 `web_search` 选项契约，让用户无需学习第二套 provider 专属开关，也能在 Gemini 上启用基于最新网页信息的回答。

## What Changes

- 为 Gemini API 模型配置补上已有的共享 `web_search` 选项，使 UI 和会话状态层对 Gemini 与 ChatGPT Web 一致处理。
- 当 `modelOptions.web_search = true` 时，将其翻译为启用 Gemini API 原生 `google_search` tool 的请求 payload。
- 保证 Gemini 内建 Google Search 与现有 native Agent function calling / tool declarations 可以共存。
- 验证普通聊天和 Agent runtime 请求都会沿用现有 `modelOptions` 链路继承同一套 Gemini `web_search` 行为。
- 明确本次范围仅接入 Gemini 的原生能力，不引入新的应用侧 `search_web` 或 `fetch_webpage` 工具。

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `gemini-api-provider`：提供与 ChatGPT Web 相同的用户侧 `web_search` 开关契约，并把它映射到 Gemini 原生 Google Search tool，覆盖普通聊天和 Agent 请求。

## Impact

- 影响静态 provider 模型配置：`packages/core/config.ts`。
- 影响 Gemini 请求构造与 native Agent 请求组装：`packages/core/src/providers/model/GeminiApiProvider.ts`。
- 影响请求 payload 组装和选项透传的 provider / 单测覆盖：`packages/core/src/providers/model/GeminiApiProvider.test.ts`、`packages/ui/src/store/chat.test.ts`，以及必要时的相关模型选项测试。
