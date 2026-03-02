## MODIFIED Requirements

### Requirement: Define configuration structure for AI providers
系统 MUST 通过静态配置字典定义大语言模型 Provider 及其模型，并为每个 Provider 声明可运行模式信息。

#### Scenario: App initialization reads available models and runtime modes
- **WHEN** 宿主应用启动并初始化运行时装配层时
- **THEN** 系统 MUST 能从 `APP_CONFIG.providers` 读取 Provider ID、名称、模型列表、默认模型以及 `supportedRuntimeModes`，用于运行时过滤与选择器渲染。

### Requirement: Separate sensitive environment variables
系统 MUST 将敏感凭据与公开配置结构分离，并通过宿主注入机制向 Provider 传递凭据，禁止将密钥硬编码在 `APP_CONFIG` 中。

#### Scenario: Passing API keys safely via runtime credentials
- **WHEN** 某 Provider 需要 API Key 进行鉴权时
- **THEN** 宿主 MUST 从环境变量读取密钥并通过 Runtime 初始化参数注入
- **AND** Provider MUST 通过注入参数获取凭据或回退到兼容路径，且 `APP_CONFIG` MUST NOT 包含明文密钥。
