English | [中文](spec.zh-CN.md)

## MODIFIED Requirements

### Requirement: Filter providers by runtime mode
系统 MUST 基于运行模式（`runtimeMode`）对 Provider 进行可用性过滤，仅暴露当前模式可运行的 Provider。`web`、`extension` 与 `desktop` 运行模式 MUST 全部受该过滤约束。承载该行为的运行时契约命名 MUST 收敛为 `ModelProviderRuntime`。

#### Scenario: Runtime mode filtering remains stable after runtime rename
- **WHEN** 宿主以任一 `runtimeMode` 初始化模型运行时装配层
- **THEN** `ModelProviderRuntime.getAvailableProviders()` MUST 仅返回当前模式支持的 Provider
- **AND** 不满足当前运行条件的 Provider MUST NOT 出现在选择器中

### Requirement: Runtime returns provider instance by providerId
系统 MUST 通过统一的模型运行时装配接口按 `providerId` 返回 `IModelProvider` 实例。在 extension 与 desktop 对比模式下，运行时 MUST 支持并发请求所需的实例隔离（例如 fresh 实例或独立通道）。该行为在类型和工厂命名收敛到 `ModelProviderRuntime` 后 MUST 保持不变。

#### Scenario: Compare workflow still obtains isolated provider instances
- **WHEN** 对比工作流通过 `ModelProviderRuntime.getProvider(providerId, { fresh: true })` 同时请求多个 Provider 实例
- **THEN** Runtime MUST 返回可并发执行且互不干扰的实例
- **AND** 各请求链路的更新与中止行为 MUST 可独立控制

### Requirement: Host injects credentials and execution dependencies through runtime initialization
宿主 MUST 在初始化模型运行时时注入凭据或执行依赖解析策略；Runtime MUST 在创建具体 Provider 实例时透传所需依赖。对 extension 与 desktop 宿主，UI 层 MUST 通过代理模型运行时调用宿主侧执行路径，不得直接耦合敏感凭据、Cookie 或受控页面读取逻辑。

#### Scenario: Proxy hosts keep runtime injection semantics after rename
- **WHEN** web、extension 或 desktop 宿主从旧命名迁移到 `ModelProviderRuntime`
- **THEN** 宿主前端 MUST 继续通过代理或工厂注入获得 provider 实例
- **AND** 真实敏感依赖的读取与执行路径 MUST 继续停留在受控宿主侧
