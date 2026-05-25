## MODIFIED Requirements

### Requirement: Host injects credentials and execution dependencies through runtime initialization
宿主 MUST 在初始化 model runtime 时注入凭证或执行依赖解析策略，runtime MUST 在创建具体 provider 实例时透传这些依赖。对于 extension 和 desktop 宿主，凡是仍依赖 host-only secrets 或 controlled page 的 provider，MUST 继续通过 proxy-backed 执行路径工作；对于敏感认证与执行链路已经收敛到本地 provider server 的 provider，则 MAY 在 `web`、`extension`、`desktop` 三端直接创建，而不再额外套一层 host proxy。

#### Scenario: 在重命名后的 runtime 中继续保持 proxy host 注入语义
- **WHEN** web、extension 或 desktop 宿主初始化 `ModelProviderRuntime`
- **THEN** host frontend MUST 继续通过 runtime factory 或 option injection 获取 provider 实例
- **AND** 仍然依赖 host-only cookie、controlled page 或 background bridge 的 provider MUST 保持这些依赖不暴露到 renderer 侧

#### Scenario: server-backed provider 可以在所有支持的宿主中直接创建
- **WHEN** 某个 provider 的敏感认证与执行路径已经收敛到本地 provider server
- **THEN** `ModelProviderRuntime` MAY 在 `web`、`extension`、`desktop` 三端直接创建该 provider
- **AND** runtime MUST 继续为并发请求保留按 provider 的 fresh-instance 语义
