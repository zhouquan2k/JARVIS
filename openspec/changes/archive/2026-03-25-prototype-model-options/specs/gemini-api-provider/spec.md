## MODIFIED Requirements

### Requirement: Implementation of Gemini API via SSE
系统 MUST 接入 Google Gemini API 以提供原生的大语言模型能力，并通过统一的流式快照契约输出标准化的 `text + annotations` 结果。该实现 MUST 同时消费 `modelId` 与规范化后的 `modelOptions`，以便在普通聊天与 Deep Research 模式之间切换 Gemini 侧请求行为。

#### Scenario: Streaming response generation
- **WHEN** 收到发往 Gemini 提供商的请求，并附带了 `modelId`
- **THEN** Provider MUST 调用 Google Generative AI 端点，且响应模式为 SSE（Server-Sent Events），确保前端能收到流式的完整正文快照
- **AND** 这些快照 MUST 通过统一的 `onUpdate` 契约返回，而不是仅返回原始分片文本

#### Scenario: Enable deep research mode for Gemini request
- **WHEN** `sendMessage` 收到 `options.modelOptions.deep_research = true`
- **THEN** Provider MUST 将该标记翻译为 Gemini 兼容的 Deep Research 请求行为
- **AND** 当该标记缺失或为 `false` 时，Provider MUST 保持现有普通聊天请求路径不变
