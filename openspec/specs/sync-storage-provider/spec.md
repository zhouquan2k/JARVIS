English | [Chinese](spec.zh-CN.md) ## ADDED Requirements ### Requirement: Sync storage provider MUST provide local-first conversation persistence
The system MUST provide一个 `SyncStorageProvider`，对外continue实现 `IStorageProvider` conversation CRUD 契约，但内部 MUST 采用“local存储优先 + 后台sync引擎”的组合架构。 #### Scenario: Save conversation without blocking on remote sync
- **WHEN** UI 调用 `saveConversation` save一条普通聊天conversation或已导入external history
- **THEN** The system MUST 先将conversationwritelocal存储并立即完成请求
- **AND** 远端sync MUST 作为后台任务异步执行，而不是阻塞current UI 交互 ### Requirement: Sync storage provider MUST isolate remote namespace by syncKey
The system MUST 使用 `syncKey` 作为远端sync命名空间标识；所有 Push、Pull、sync游标和delete广播 MUST 只作用于current `syncKey` 对应的数据集合。 #### Scenario: Pull only returns current syncKey namespace
- **WHEN** sync引擎使用某个 `syncKey` 调用远端 `pull`
- **THEN** The system MUST 只接收该 `syncKey` 命名空间下的conversation增量
- **AND** The system MUST NOT 混入其他 `syncKey` 的conversation或游标状态 #### Scenario: Sync storage provider talks to real sync server
- **WHEN** Web 或 Extension host为 `SyncStorageProvider` 注入真实的远端 transport
- **THEN** 该 provider MUST 调用仓库内落地的 `/api/sync/push` 与 `/api/sync/pull` 服务端interface
- **AND** transport MUST 通过 `x-sync-key` 请求头而不是共享global状态传递current命名空间 #### Scenario: Default syncKey zero is only allowed in development
- **WHEN** host初始化sync存储时read到 `syncKey = "0"`
- **THEN** 开发环境 MUST allowcontinue初始化synccapability
- **AND** 非开发环境 MUST 阻止sync初始化并promptthe userconfiguration真实 `syncKey` ### Requirement: Sync storage provider MUST perform incremental sync and ignore compare payload
sync引擎 MUST 基于脏标记与sync游标执行增量 Push/Pull，并对the same `Conversation.id` 使用 `updatedAt` 的 LWW rulemerge冲突；本阶段 MUST NOT sync `compare` 载荷。 #### Scenario: Push dirty conversations without compare data
- **WHEN** local存在 `sync.dirty = true` 的conversation需要上报
- **THEN** The system MUST only上报普通聊天conversation与已导入external history所需字段
- **AND** The system MUST 从远端sync载荷中排除 `compare` 字段 #### Scenario: Pull remote updates with last-write-wins merge
- **WHEN** 远端return与local相同 `Conversation.id` 但 `updatedAt` 更晚的conversation
- **THEN** The system MUST 使用远端版本覆盖local较旧版本
- **AND** The system MUST updatecurrent `syncKey` 对应的sync游标 #### Scenario: Pull uses server cursor instead of client timestamps
- **WHEN** sync引擎从远端服务端拉取增量数据
- **THEN** The system MUST 使用服务端return的 `nextCursor` 作为后续增量sync游标
- **AND** The system MUST NOT 直接将客户端 `updatedAt` 作为远端增量游标使用 ### Requirement: Sync storage provider MUST push local unsynced conversations on every startup
sync引擎 MUST 在每次启动调用 `hydrate()` 时识别local已有但尚未sync的普通聊天conversation与已导入external history，并将这些 backlog automatically推送到current `syncKey` 对应的远端服务。 #### Scenario: Hydrate pushes legacy local conversations that lack sync metadata
- **WHEN** host启动 `SyncStorageProvider`，且local存在不含 `sync` 元数据的普通聊天conversation或已导入external history
- **THEN** The system MUST 将这些记录视为“未sync”并纳入当次启动的 push
- **AND** sync完成后这些记录 MUST 被标记为已sync状态，而不是continue无限重复上报 #### Scenario: Hydrate does not push compare-only conversations
- **WHEN** host启动 `SyncStorageProvider`，且local存在only用于recovery UI 的 `compare` conversation
- **THEN** The system MUST 保留这些记录的local持久化capability
- **AND** The system MUST NOT 在启动补偿阶段将其推送到远端服务 #### Scenario: Newly created conversation is still pushed after initialization
- **WHEN** 启动完成后the user新建一条普通聊天conversation或导入一条新的external history
- **THEN** The system MUST continue在save后将该记录标记为 dirty 并纳入后续 push
- **AND** 该行为 MUST 不依赖“only启动时补偿 backlog”逻辑才能生效 ### Requirement: Sync storage provider MUST preserve question metadata through local-first sync
sync存储实现 MUST 在localsave、增量 push、远端 pull 和启动补偿过程中完整保留message级question索引元数据，包括 `questionId`、`starred`、`deleted` 与 `createdAt`。这些字段 MUST 随 `Conversation.messages` 一起sync，而不是only保留在current设备local。 #### Scenario: Push and pull question metadata without loss
- **WHEN** localconversation中的message包含 `questionId`、`starred`、`deleted` 或 `createdAt`
- **THEN** sync存储实现 MUST 在 push 到远端后仍能在后续 pull result中recovery这些字段
- **AND** 多端read到的conversationmessage MUST keep一致的question索引元数据 ### Requirement: Sync storage provider MUST not conflate message soft delete with conversation deletion
sync存储实现 MUST 区分“message级问答对软delete”和“整条conversationdelete”这两种语义。message级 `deleted` only表示该问答对应从main threadrender与local索引中filter；它 MUST NOT 被error提升为 `conversation.sync.deleted` 或触发整conversation的远端delete广播。 #### Scenario: Sync a conversation containing deleted question pairs
- **WHEN** conversation中某个 `questionId` 下的message被标记为message级 `deleted = true`，但整条conversation仍然有效
- **THEN** sync存储实现 MUST continuesync该conversation本身
- **AND** The system MUST NOT 将该状态解释为整条conversation已被delete ### Requirement: Sync storage provider MUST propagate hard-deleted conversations as delete events
sync存储实现 MUST 将left-sidehistorylist触发的整conversationdelete作为独立delete事件进行 push / pull，而不是continue依赖长期保留的 `conversation.sync.deleted` tombstone。delete事件一旦被远端确认，local普通conversationlist中 MUST 不再保留该conversation。 #### Scenario: Push deleted conversation as dedicated sync event
- **WHEN** the user从left-sidelocalhistorylistdelete一条conversation
- **THEN** sync存储实现 MUST 立即从localconversation集合中移除该conversation
- **AND** The system MUST 在后续 push 中上报该conversation的独立delete事件，而不是把已deleteconversation作为普通 `Conversation` 再次save #### Scenario: Pull remote delete event and remove local conversation
- **WHEN** 其他客户端已delete某条conversation，current客户端在 pull result中收到该conversation的delete事件
- **THEN** sync存储实现 MUST deletelocal对应conversation
- **AND** localhistorylist MUST 不再展示该conversation #### Scenario: Ignore stale delete event when local conversation is newer
- **WHEN** current客户端local存在the same `Conversation.id` 的更晚版本，而 pull return的delete事件时间早于该local版本
- **THEN** sync存储实现 MUST 忽略该陈旧delete事件
- **AND** 后续sync MUST allowlocal较新版本continue参与 push ### Requirement: Sync storage provider MUST preserve conversation document associations through local-first sync
sync存储实现 MUST 在localsave、增量 push、远端 pull 和启动补偿过程中完整保留conversation级 `documentPaths`，使多端都能基于the same份document关联元数据展示document相关conversationlist。 #### Scenario: Push and pull document paths without loss
- **WHEN** localconversation包含一个或多个 `documentPaths`
- **THEN** sync存储实现 MUST 在 push 到远端后仍能在后续 pull result中recovery这些路径
- **AND** 多端read到的conversation MUST keep一致的document关联信息 #### Scenario: Hydrate legacy local conversations that already contain document paths
- **WHEN** host启动 `SyncStorageProvider`，且local存在尚未sync但已包含 `documentPaths` 的conversation
- **THEN** The system MUST 将这些字段一并纳入启动补偿 push
- **AND** sync完成后后续 pull MUST continuereturn这些document关联信息 #### Scenario: Preserve compatibility for synced conversations without document paths
- **WHEN** sync存储实现read或拉取一条未包含 `documentPaths` 的旧conversation
- **THEN** The system MUST allow该字段缺省
- **AND** MUST NOT 因字段缺失导致sync失败
