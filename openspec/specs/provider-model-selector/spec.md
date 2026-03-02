## ADDED Requirements

### Requirement: Show Provider Selector in chat interface
聊天界面必须提供一个可见的下拉框，用于选择预置的 AI 模型提供商（Provider）。

#### Scenario: Provider options are populated from config
- **WHEN** 聊天主界面渲染时
- **THEN** Provider 下拉框中应该显示从 `config.ts` 获取的所有 `APP_CONFIG.providers`（如 ChatGPT, Gemini）。

### Requirement: Show cascading Model Selector based on Provider
根据用户选定的 Provider，Model 下拉框必须动态更新为其支持的模型列表。

#### Scenario: Provider changes trigger Model list refresh
- **WHEN** 用户在 Provider 下拉框中从 ChatGPT 切换到 Gemini 时
- **THEN** Model 下拉框应该自动清空 ChatGPT 的关联模型，重新填充 Gemini 支持的模型，并且选中 `APP_CONFIG` 中对应 Provider 的 `defaultModel`。

### Requirement: Include selection payload on message send
用户发送聊天信息时，系统必须明确附带当前所选的 providerId 与 modelId。

#### Scenario: Sending user prompt
- **WHEN** 用户输入聊天内容并点击发送时
- **THEN** 界面传递给网络代理层的数据结构必须包含 `{ providerId, modelId, prompt }`。
