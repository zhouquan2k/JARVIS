## MODIFIED Requirements

### Requirement: Filter providers by runtime mode
系统 MUST 基于运行模式（`runtimeMode`）对 Provider 进行可用性过滤，仅暴露当前模式可运行的 Provider。除 Web 外，extension 运行模式 MUST 同样受该过滤约束。

#### Scenario: Extension runtime filters provider list
- **WHEN** 宿主以 `runtimeMode = 'extension'` 初始化运行时装配层时
- **THEN** 返回的可用 Provider 列表 MUST 仅包含 `supportedRuntimeModes` 含 `extension` 的 Provider
- **AND** 不满足 extension 运行条件的 Provider MUST NOT 出现在选择器中。

### Requirement: Runtime returns provider instance by providerId
系统 MUST 通过统一的运行时装配接口按 `providerId` 返回 `IModelProvider` 实例。在 extension 对比模式下，运行时 MUST 支持并发请求所需的实例隔离（例如 fresh 实例或独立通道）。

#### Scenario: Extension compare workflow obtains isolated provider instances
- **WHEN** 对比工作流在 extension 宿主中同时请求 Model A 与 Model B Provider 实例
- **THEN** Runtime MUST 返回可并发执行且互不干扰的实例
- **AND** A/B 两路请求的更新与中止行为 MUST 可独立控制。

### Requirement: Host injects credentials through runtime initialization
宿主 MUST 在初始化 Runtime 时注入凭据或凭据解析策略；Runtime MUST 在创建具体 Provider 实例时透传所需凭据。对 extension 宿主，UI 层 MUST 通过代理运行时调用 Background，不得直接耦合敏感凭据读取逻辑。

#### Scenario: Extension host uses proxy runtime without exposing credentials in UI
- **WHEN** extension 宿主初始化运行时并请求模型 Provider
- **THEN** 宿主前端 MUST 获取代理 Provider 实例而非直接真实 Provider
- **AND** 真实凭据读取与网络请求执行 MUST 在 Background 路径中完成。
