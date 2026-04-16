English | [Chinese](spec.zh-CN.md) ## ADDED Requirements ### Requirement: Sync server MUST provide namespaced incremental sync APIs
The system MUST 在仓库内provide独立的sync服务端应用，为 Web 与 Extension hostexpose真实的 `POST /api/sync/push`、`POST /api/sync/pull` 和 `GET /health` interface。 #### Scenario: Health endpoint reports readiness
- **WHEN** local开发或测试环境探测sync服务端状态
- **THEN** `GET /health` MUST return可机器read的成功响应
- **AND** 调用方 MUST 能据此判断sync服务端已可接受请求 #### Scenario: Push stores conversations under current syncKey namespace
- **WHEN** 客户端携带某个 `x-sync-key` 调用 `POST /api/sync/push`
- **THEN** 服务端 MUST only在该 `syncKey` 命名空间下处理并持久化conversation
- **AND** 服务端 MUST return被成功接受的 `processedIds` 与该命名空间的最新 `nextCursor` #### Scenario: Pull returns only current namespace changes
- **WHEN** 客户端携带某个 `x-sync-key` 调用 `POST /api/sync/pull`
- **THEN** 服务端 MUST 只return该 `syncKey` 下 `server_cursor > cursor` 的增量conversation
- **AND** 服务端 MUST NOT 混入其他 `syncKey` 的conversation或游标 ### Requirement: Sync server MUST persist conversations in SQLite using conversation aggregates
The system MUST 使用 SQLite 持久化 `Conversation` 聚合对象，而不是在本次变更中拆分出独立 `Message` 表。 #### Scenario: Store conversation aggregate without compare payload
- **WHEN** 服务端接收一条普通聊天conversation或已导入external history
- **THEN** 服务端 MUST 将标准化后的conversation聚合对象write SQLite
- **AND** 服务端 MUST 忽略 `compare` 字段，即使客户端error上报也不得持久化 #### Scenario: Maintain per-syncKey monotonic server cursor
- **WHEN** 服务端成功处理一条entercurrent命名空间的 push 数据
- **THEN** 服务端 MUST 为该 `syncKey` 分配单调递增的 `server_cursor`
- **AND** 后续 pull MUST 依据该 `server_cursor` 而不是客户端 `updatedAt` return增量 ### Requirement: Sync server MUST apply last-write-wins conflict resolution
服务端 MUST 使用客户端 `updatedAt` 作为业务时间执行 LWW 冲突处理，并在时间戳相同的情况下采用“delete优先，否则保留已有版本”的rule。 #### Scenario: Newer conversation replaces older persisted version
- **WHEN** the same `syncKey + Conversation.id` 收到一条 `updatedAt` 更晚的conversation
- **THEN** 服务端 MUST 用新版本覆盖旧记录
- **AND** 后续 pull MUST return覆盖后的版本 #### Scenario: Older conversation does not overwrite newer persisted version
- **WHEN** the same `syncKey + Conversation.id` 收到一条 `updatedAt` 更早的conversation
- **THEN** 服务端 MUST 忽略该write
- **AND** returnresult MUST 不把旧版本当作新变更重新广播 #### Scenario: Deleted conversation wins on equal timestamps
- **WHEN** the same `syncKey + Conversation.id` 的新旧版本 `updatedAt` 相同，但新版本标记为 `deleted = true`
- **THEN** 服务端 MUST 接受delete版本覆盖未delete版本
- **AND** 后续 pull MUST return `deleted = true` 的版本 ### Requirement: Sync server MUST validate syncKey and request payloads
服务端 MUST 校验 `x-sync-key`、请求体结构和message字段完整性，并在无效请求时return明确的error状态。 #### Scenario: Reject empty syncKey
- **WHEN** 客户端未provide `x-sync-key` 或provide空白值
- **THEN** 服务端 MUST return `400`
- **AND** 服务端 MUST NOT 执行任何持久化操作 #### Scenario: Reject default syncKey in non-development environments
- **WHEN** 服务端运行于非开发环境且客户端provide `syncKey = "0"`
- **THEN** 服务端 MUST return `400`
- **AND** 服务端 MUST promptdefault `syncKey=0` 只allow在开发环境使用 #### Scenario: Reject malformed conversation payload
- **WHEN** push 请求中的conversation缺失 `id`、`title`、`messages` 或 `updatedAt`
- **THEN** 服务端 MUST return `400`
- **AND** 服务端 MUST NOT 部分writeinvalid数据 ### Requirement: Sync server MUST support cross-origin access for Web and Extension hosts
由于sync服务端以独立应用形态运行，The system MUST provide面向 Web 与 Extension host的 CORS 与预检support。 #### Scenario: Development environment allows configured cross-origin requests
- **WHEN** 开发环境中的 Web 或 Extension host向sync服务端发起跨源请求
- **THEN** 服务端 MUST 正确处理 `OPTIONS` 预检
- **AND** 响应头 MUST allow `content-type` 与 `x-sync-key` #### Scenario: Production environment rejects unknown origins
- **WHEN** 生产环境收到不在 allowlist 中的跨源请求
- **THEN** 服务端 MUST 拒绝该请求
- **AND** 服务端 MUST NOT 对未授权来源开放通配 CORS ### Requirement: Sync server MUST expose provider remote config endpoints
The system MUST 在现有服务端应用中同时provide provider remoteconfiguration分发interface，以便扩展端拉取 Gemini historyselectorconfiguration。 #### Scenario: Fetch Gemini provider config from server
- **WHEN** 客户端请求 Gemini historyremoteconfigurationinterface
- **THEN** 服务端 MUST return最新版本的 Gemini configuration JSON
- **AND** 响应 MUST 包含适合客户端cache与版本判定的元信息 #### Scenario: Unknown provider config returns not found
- **WHEN** 客户端请求不存在的 provider configuration
- **THEN** 服务端 MUST return `404`
- **AND** 服务端 MUST NOT return空白成功响应 ### Requirement: Sync server MUST accept dedicated conversation delete events
sync服务端 MUST 在现有 `push` / `pull` 增量sync协议中support整conversationdelete事件，用于传播left-sidehistorylist触发的硬delete，而不是要求客户端continue上传带 tombstone 的完整conversation聚合。 #### Scenario: Push hard-delete event for conversation
- **WHEN** 客户端携带某个 `x-sync-key` 调用 `POST /api/sync/push`，且请求中包含一条conversationdelete事件
- **THEN** 服务端 MUST 接受该delete事件并将其纳入current命名空间的增量游标
- **AND** 服务端 MUST 不要求客户端同时上报该已deleteconversation的完整 `Conversation` 载荷 #### Scenario: Pull returns conversation delete events
- **WHEN** 客户端携带某个 `x-sync-key` 调用 `POST /api/sync/pull`
- **THEN** 服务端 MUST return该命名空间自指定游标之后的conversationdelete事件
- **AND** 这些delete事件 MUST 与普通conversation增量一样遵循单调递增的游标顺序 ### Requirement: Sync server MUST physically remove deleted conversations from persisted aggregates
服务端在接收到整conversationdelete事件后 MUST 物理移除current `syncKey` 下对应的conversation聚合记录，而不是把已deleteconversation长期保留为隐藏 tombstone。 #### Scenario: Hard delete removes persisted conversation aggregate
- **WHEN** 服务端接收到某个 `Conversation.id` 的有效delete事件
- **THEN** 服务端 MUST 从conversation聚合存储中移除该记录
- **AND** 后续针对该 `Conversation.id` 的read或增量conversationresult MUST 不再包含该conversation聚合 #### Scenario: Delete event is still visible to other clients after hard delete
- **WHEN** 一条conversation已在服务端物理delete，但其他客户端尚未 pull 到该deleteresult
- **THEN** 服务端 MUST continue保留该delete事件直到相关客户端能够通过游标read
- **AND** 服务端 MUST NOT 因conversation聚合已被delete而丢失delete广播capability ### Requirement: Sync server MUST resolve delete events with updatedAt-aware ordering
服务端 MUST 使用delete事件携带的 `updatedAt` 与现有conversation版本执行时间比较，确保旧delete不会覆盖update的conversation版本，而有效delete可以稳定清除较旧记录。 #### Scenario: Newer delete event removes older stored conversation
- **WHEN** 服务端已持久化一条conversation，随后收到the same `Conversation.id` 且 `updatedAt` 更晚的delete事件
- **THEN** 服务端 MUST 接受该delete事件并delete已存conversation
- **AND** 后续 pull MUST 将该delete事件作为最新状态return #### Scenario: Older delete event does not remove newer stored conversation
- **WHEN** 服务端已持久化一条较新的conversation版本，但随后收到the same `Conversation.id` 且 `updatedAt` 更早的delete事件
- **THEN** 服务端 MUST 忽略该delete事件对currentconversation的覆盖
- **AND** 服务端 MUST 不把该陈旧delete广播为最新变更 ### Requirement: Sync server MUST expose context HTTP endpoints that preserve IContextProvider semantics
服务端 MUST 在现有应用内provide `/api/context` capability，并将 `IContextProvider` 的 `initializeAccess`、`getContext`、`getConversations`、`readDocument`、`writeDocument`、`createNode`、`deleteNode`、`renameNode`、`searchInScope` 语义通过 HTTP 端点expose给 browser 端。该 contract MUST 优先保证与共享interface命名一致，而不是重建另一套资源型 REST 语义。 #### Scenario: Initialize remote context access
- **WHEN** Web host首次enterknowledge workspace并调用远端 context provider
- **THEN** 服务端 MUST 处理 `/api/context/initialize-access`
- **AND** 该响应 MUST 足以让 browser 端continue执行后续directory树、document和documentconversation请求 #### Scenario: Read write and manage nodes through endpoint methods
- **WHEN** browser 端请求directory树、documentread、documentwrite、节点create、节点delete或节点rename
- **THEN** 服务端 MUST 通过 `/api/context` 下与 `getContext`、`readDocument`、`writeDocument`、`createNode`、`deleteNode`、`renameNode` 对应的 endpoint 处理这些请求
- **AND** `readDocument` 的result MUST 至少包含 `path`、`mimeType` 与 `dataBase64`
- **AND** `writeDocument` MUST 接受与共享 `WriteContextDocumentInput` 一致的input语义 #### Scenario: Serve PDF through the same readDocument endpoint
- **WHEN** browser 端请求read一个 PDF document
- **THEN** 服务端 MUST continue通过 `readDocument` return该document
- **AND** 服务端 MUST NOT 额外要求 browser 端调用独立的 `readBinaryDocument` endpoint #### Scenario: Return document-scoped conversations through the context API
- **WHEN** browser 端请求某个document的关联conversationlist
- **THEN** 服务端 MUST 通过 `/api/context/get-conversations` returnresult
- **AND** browser 端 MUST 通过 `getConversations({ documentPath })` 表达该query
- **AND** returnresult MUST 只包含 `documentPaths` 精确包含目标路径的conversation ### Requirement: Sync server MUST preserve conversation document associations in sync payloads
sync服务端 MUST 在 push / pull 协议与持久化聚合对象中完整保留conversation级 `documentPaths` 字段，使客户端能够在跨设备sync后continue按document聚合相关conversation。 #### Scenario: Store document paths on pushed conversations
- **WHEN** 客户端上报一条包含 `documentPaths` 的普通聊天conversation
- **THEN** 服务端 MUST 将这些路径作为conversation聚合的一部分save
- **AND** 后续 pull MUST return相同的 `documentPaths` #### Scenario: Preserve compatibility for pushed conversations without document paths
- **WHEN** 客户端上报一条未包含 `documentPaths` 的旧conversation
- **THEN** 服务端 MUST allow该字段缺省
- **AND** 服务端 MUST NOT 因字段缺失拒绝该conversation ### Requirement: Sync server MUST keep backend implementation swappable behind the same context contract
服务端 MUST allow `/api/context` 背后的具体实现从临时local文件后端演进到数据库后端，而不要求 browser 端修改调用契约。 #### Scenario: Serve context data from a local file backend
- **WHEN** 服务端current使用 `LocalFileContextProvider`
- **THEN** 服务端 MAY 从 `CHATPRISM_KNOWLEDGE_ROOT` 指定的根路径read和write上下文数据
- **AND** 所有访问 MUST 被约束在该 provider 定义的边界内 #### Scenario: Replace the backend without changing browser contract
- **WHEN** 服务端将 `/api/context` 的底层实现从 `LocalFileContextProvider` switch为 `DatabaseContextProvider`
- **THEN** browser 端调用的 endpoint 路径和请求语义 MUST keep不变
- **AND** 不同the user的 context 映射 MAY 在新的 provider 内部实现
