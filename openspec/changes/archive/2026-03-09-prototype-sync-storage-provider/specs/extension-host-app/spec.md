## MODIFIED Requirements

### Requirement: Extension host MUST initialize shared stores with proxy runtime
扩展全窗口宿主 MUST 在启动时同时初始化普通聊天、历史导入与对比流程所需的 store，并通过 extension runtime 注入可用 Provider、历史 provider 与同步存储实现；同步命名空间 MUST 由设置中的 `syncKey` 决定。

#### Scenario: Host bootstraps runtime and stores on page load
- **WHEN** 扩展全窗口页面完成初始化
- **THEN** 宿主 MUST 为 `useChatStore` 注入模型解析器、历史 provider 与 `SyncStorageProvider`
- **AND** 宿主 MUST 为 `useCompareStore` 注入可按 `providerId` 获取实例的 runtime，并仅暴露 extension 运行模式可用 Provider。

#### Scenario: Extension host validates syncKey before enabling sync
- **WHEN** 扩展宿主初始化同步能力并读取到 `syncKey = "0"`
- **THEN** 开发环境 MUST 允许继续初始化
- **AND** 非开发环境 MUST 阻止同步初始化并提示用户配置真实 `syncKey`

#### Scenario: Extension host pushes pre-existing local unsynced conversations on every startup
- **WHEN** 扩展宿主启动时本地存储中已经存在普通聊天会话或已导入外部历史，但这些记录尚未进入远端服务端
- **THEN** 宿主 MUST 在初始化 `SyncStorageProvider` 后触发包含补偿语义的 `hydrate()`
- **AND** 该次启动的同步 MUST 将这些本地旧记录推送到当前 `syncKey` 对应的远端命名空间

## ADDED Requirements

### Requirement: Extension host MUST keep compare persistence local-only during phase 7
扩展宿主在 phase 7 中 MUST 继续仅将 `compare` 历史保存在本地，不得将其纳入远端同步载荷。

#### Scenario: Compare workflow completes while sync is enabled
- **WHEN** 扩展宿主在启用同步能力的情况下完成一轮对比流程
- **THEN** 系统 MAY 将 `compare` 结果写入本地会话存储用于恢复
- **AND** 系统 MUST NOT 将该 `compare` 结果作为远端同步内容上报
