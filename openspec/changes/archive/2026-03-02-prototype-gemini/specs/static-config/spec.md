## ADDED Requirements

### Requirement: Define configuration structure for AI providers
系统必须通过一个静态配置字典来定义支持的大语言模型提供商及其模型。

#### Scenario: App initialization reads available models
- **WHEN** 应用程序（UI 或 Background）启动并需要获取模型支持列表时
- **THEN** 应该能从 `APP_CONFIG.providers` 读取到完整的 Provider 树形结构（包含 ID、名称、可用模型列表及默认模型）。

### Requirement: Separate sensitive environment variables
系统必须将敏感的 API 密钥信息与公开的配置结构分离存放。

#### Scenario: Passing API keys safely
- **WHEN** 新的提供商（如 Gemini）需要 API Key 进行身份认证时
- **THEN** 它们必须从 `.env` 注入的环境变量（如 `WXT_GEMINI_API_KEY`）中读取，绝不硬编码在 `APP_CONFIG` 中。
