## MODIFIED Requirements

### Requirement: Define configuration structure for AI providers
系统 MUST 通过静态配置字典定义大语言模型 Provider 及其模型，并为每个 Provider 声明可运行模式信息；系统同时 MUST 在同一配置中定义分析引擎节点 `APP_CONFIG.analyzer`，用于声明分析默认 Provider、默认模型和系统提示词模板。

#### Scenario: App initialization reads available models and runtime modes
- **WHEN** 宿主应用启动并初始化运行时装配层时
- **THEN** 系统 MUST 能从 `APP_CONFIG.providers` 读取 Provider ID、名称、模型列表、默认模型以及 `supportedRuntimeModes`，用于运行时过滤与选择器渲染。

#### Scenario: Analyzer reads default provider, model and prompt template
- **WHEN** 系统开始执行对比分析任务时
- **THEN** 系统 MUST 从 `APP_CONFIG.analyzer` 读取 `defaultProvider`、`defaultModel` 和 `systemPrompt`
- **AND** `systemPrompt` MUST 包含 `{prompt}`、`{outputA}`、`{outputB}` 三个占位符，并要求模型输出以原答案原文摘录为主的 JSON（非评论导向）。
