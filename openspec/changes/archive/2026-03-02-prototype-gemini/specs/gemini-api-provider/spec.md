## ADDED Requirements

### Requirement: Implementation of Gemini API via SSE
系统必须接入 Google Gemini Pro API 以提供原生的大语言模型能力。

#### Scenario: Streaming response generation
- **WHEN** 收到发往 Gemini 提供商的请求，并附带了 `modelId`
- **THEN** Provider 必须调用 Google Generative AI 端点，且响应模式为 SSE（Server-Sent Events），确保前端能收到流式的逐字数据。

### Requirement: Inject Authentication Key securely
在构造 Google API 的网络请求时，必须正确鉴权且不能将密钥留存于代码逻辑。

#### Scenario: Constructing API Request
- **WHEN** 生成向 Gemini 提交内容的 URL 时
- **THEN** URL 查询参数中必须包含从系统环境变量（如 `WXT_GEMINI_API_KEY`）中动态获取的 `key=${apiKey}`。
