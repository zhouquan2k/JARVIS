## ADDED Requirements

### Requirement: Filter providers by runtime mode
系统 MUST 基于运行模式（`runtimeMode`）对 Provider 进行可用性过滤，仅暴露当前模式可运行的 Provider。

#### Scenario: Web runtime filters provider list
- **WHEN** 宿主以 `runtimeMode = 'web'` 初始化运行时装配层时
- **THEN** 返回的可用 Provider 列表 MUST 仅包含 `supportedRuntimeModes` 含 `web` 的 Provider。

### Requirement: Runtime returns provider instance by providerId
系统 MUST 通过统一的运行时装配接口按 `providerId` 返回 `IModelProvider` 实例。

#### Scenario: Host gets provider instance from runtime
- **WHEN** UI 或 Store 请求指定 `providerId` 的 Provider 实例
- **THEN** Runtime MUST 返回实现 `IModelProvider` 契约的对象，供后续调用 `checkAuth/sendMessage/abort`。

### Requirement: Host injects credentials through runtime initialization
宿主 MUST 在初始化 Runtime 时注入凭据，Runtime MUST 在创建具体 Provider 实例时透传所需凭据。

#### Scenario: Runtime passes injected credentials to provider
- **WHEN** 宿主使用 `createProviderRuntime({ runtimeMode, credentials })` 初始化并请求 Gemini Provider 实例
- **THEN** Runtime MUST 使用注入的凭据创建 Provider，且 Provider MUST 优先使用显式注入值而非宿主特定环境变量名。
