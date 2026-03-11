## MODIFIED Requirements

### Requirement: Implementation of Gemini API via SSE
系统 MUST 接入 Google Gemini API 以提供原生的大语言模型能力，并通过统一的流式快照契约输出标准化的 `text + annotations` 结果。

#### Scenario: Streaming response generation
- **WHEN** 收到发往 Gemini 提供商的请求，并附带了 `modelId`
- **THEN** Provider MUST 调用 Google Generative AI 端点，且响应模式为 SSE（Server-Sent Events），确保前端能收到流式的完整正文快照
- **AND** 这些快照 MUST 通过统一的 `onUpdate` 契约返回，而不是仅返回原始分片文本

### Requirement: Inject Authentication Key securely
在构造 Google API 的网络请求时，系统 MUST 正确鉴权且不能将密钥留存于代码逻辑。

#### Scenario: Constructing API Request
- **WHEN** 生成向 Gemini 提交内容的 URL 时
- **THEN** URL 查询参数中 MUST 包含从系统环境变量（如 `WXT_GEMINI_API_KEY`）中动态获取的 `key=${apiKey}`
- **AND** 该密钥 MUST 不得被硬编码到仓库源代码中

## ADDED Requirements

### Requirement: Gemini provider MUST support inline attachment payloads
系统 MUST 支持将图片和通用文件附件以内联数据的方式提交给 Gemini，以满足当前阶段的多模态输入需求。

#### Scenario: Encode attachments as inline data
- **WHEN** 用户消息附带不超过 10MB 的图片或文件附件
- **THEN** Provider MUST 将附件编码为 Gemini 兼容的 `inlineData` 或等价 `parts` 结构
- **AND** 这些附件 MUST 与同一条消息的文本提示一起提交
