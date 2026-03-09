## ADDED Requirements

### Requirement: Web host MUST initialize shared stores with sync storage provider
Web 宿主 MUST 在启动时使用 `SyncStorageProvider` 作为聊天历史存储实现，并通过设置中的 `syncKey` 决定远端同步命名空间。

#### Scenario: Web host bootstraps sync storage on page load
- **WHEN** Web 宿主完成启动并初始化聊天 store
- **THEN** 宿主 MUST 为共享聊天视图注入 `SyncStorageProvider`
- **AND** 该 provider MUST 使用当前设置中的 `syncKey` 初始化同步上下文

#### Scenario: Web host rejects development syncKey outside development
- **WHEN** Web 宿主运行于非开发环境且当前 `syncKey` 为 `0`
- **THEN** 宿主 MUST 阻止同步初始化
- **AND** 宿主 MUST 显示用户可见的配置提示

#### Scenario: Web host pushes pre-existing local unsynced conversations on every startup
- **WHEN** Web 宿主启动时本地 IndexedDB 中已经存在普通聊天会话或已导入外部历史，但这些记录尚未被同步到服务端
- **THEN** 宿主 MUST 通过 `SyncStorageProvider.hydrate()` 触发启动补偿
- **AND** 这些本地旧记录 MUST 在该次启动的同步完成后进入当前 `syncKey` 对应的远端命名空间

### Requirement: Web host MUST keep compare history out of phase 7 sync
Web 宿主在 phase 7 中 MUST 仅同步普通聊天会话与已导入外部历史，不得将 `compare` 历史纳入远端同步。

#### Scenario: Web host persists compare result while sync is enabled
- **WHEN** 用户在 Web 宿主中完成对比聊天并产生 `compare` 结果
- **THEN** 系统 MAY 将 `compare` 数据保存在本地用于页面恢复
- **AND** 系统 MUST NOT 将 `compare` 数据包含在远端 `push` 请求中
