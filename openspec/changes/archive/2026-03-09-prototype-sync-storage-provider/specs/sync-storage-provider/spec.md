## ADDED Requirements

### Requirement: Sync storage provider MUST provide local-first conversation persistence
系统 MUST 提供一个 `SyncStorageProvider`，对外继续实现 `IStorageProvider` 会话 CRUD 契约，但内部 MUST 采用“本地存储优先 + 后台同步引擎”的组合架构。

#### Scenario: Save conversation without blocking on remote sync
- **WHEN** UI 调用 `saveConversation` 保存一条普通聊天会话或已导入外部历史
- **THEN** 系统 MUST 先将会话写入本地存储并立即完成请求
- **AND** 远端同步 MUST 作为后台任务异步执行，而不是阻塞当前 UI 交互

### Requirement: Sync storage provider MUST isolate remote namespace by syncKey
系统 MUST 使用 `syncKey` 作为远端同步命名空间标识；所有 Push、Pull、同步游标和删除广播 MUST 只作用于当前 `syncKey` 对应的数据集合。

#### Scenario: Pull only returns current syncKey namespace
- **WHEN** 同步引擎使用某个 `syncKey` 调用远端 `pull`
- **THEN** 系统 MUST 只接收该 `syncKey` 命名空间下的会话增量
- **AND** 系统 MUST NOT 混入其他 `syncKey` 的会话或游标状态

#### Scenario: Sync storage provider talks to real sync server
- **WHEN** Web 或 Extension 宿主为 `SyncStorageProvider` 注入真实的远端 transport
- **THEN** 该 provider MUST 调用仓库内落地的 `/api/sync/push` 与 `/api/sync/pull` 服务端接口
- **AND** transport MUST 通过 `x-sync-key` 请求头而不是共享全局状态传递当前命名空间

#### Scenario: Default syncKey zero is only allowed in development
- **WHEN** 宿主初始化同步存储时读取到 `syncKey = "0"`
- **THEN** 开发环境 MUST 允许继续初始化同步能力
- **AND** 非开发环境 MUST 阻止同步初始化并提示用户配置真实 `syncKey`

### Requirement: Sync storage provider MUST perform incremental sync and ignore compare payload
同步引擎 MUST 基于脏标记与同步游标执行增量 Push/Pull，并对同一 `Conversation.id` 使用 `updatedAt` 的 LWW 规则合并冲突；本阶段 MUST NOT 同步 `compare` 载荷。

#### Scenario: Push dirty conversations without compare data
- **WHEN** 本地存在 `sync.dirty = true` 的会话需要上报
- **THEN** 系统 MUST 仅上报普通聊天会话与已导入外部历史所需字段
- **AND** 系统 MUST 从远端同步载荷中排除 `compare` 字段

#### Scenario: Pull remote updates with last-write-wins merge
- **WHEN** 远端返回与本地相同 `Conversation.id` 但 `updatedAt` 更晚的会话
- **THEN** 系统 MUST 使用远端版本覆盖本地较旧版本
- **AND** 系统 MUST 更新当前 `syncKey` 对应的同步游标

#### Scenario: Pull uses server cursor instead of client timestamps
- **WHEN** 同步引擎从远端服务端拉取增量数据
- **THEN** 系统 MUST 使用服务端返回的 `nextCursor` 作为后续增量同步游标
- **AND** 系统 MUST NOT 直接将客户端 `updatedAt` 作为远端增量游标使用

### Requirement: Sync storage provider MUST push local unsynced conversations on every startup
同步引擎 MUST 在每次启动调用 `hydrate()` 时识别本地已有但尚未同步的普通聊天会话与已导入外部历史，并将这些 backlog 自动推送到当前 `syncKey` 对应的远端服务。

#### Scenario: Hydrate pushes legacy local conversations that lack sync metadata
- **WHEN** 宿主启动 `SyncStorageProvider`，且本地存在不含 `sync` 元数据的普通聊天会话或已导入外部历史
- **THEN** 系统 MUST 将这些记录视为“未同步”并纳入当次启动的 push
- **AND** 同步完成后这些记录 MUST 被标记为已同步状态，而不是继续无限重复上报

#### Scenario: Hydrate does not push compare-only conversations
- **WHEN** 宿主启动 `SyncStorageProvider`，且本地存在仅用于恢复 UI 的 `compare` 会话
- **THEN** 系统 MUST 保留这些记录的本地持久化能力
- **AND** 系统 MUST NOT 在启动补偿阶段将其推送到远端服务

#### Scenario: Newly created conversation is still pushed after initialization
- **WHEN** 启动完成后用户新建一条普通聊天会话或导入一条新的外部历史
- **THEN** 系统 MUST 继续在保存后将该记录标记为 dirty 并纳入后续 push
- **AND** 该行为 MUST 不依赖“仅启动时补偿 backlog”逻辑才能生效
