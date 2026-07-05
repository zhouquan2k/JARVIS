English | [Chinese](spec.zh-CN.md)

## Purpose
Define the server-side contracts for namespaced conversation sync, task sync, provider config delivery, and remote context access.

## Requirements

### Requirement: Sync server MUST provide namespaced incremental sync APIs
The system MUST 在仓库内 provide 独立的 sync 服务端应用，为 Web 与 Extension host expose 真实的 `POST /api/sync/push`、`POST /api/sync/pull` 和 `GET /health` interface。

#### Scenario: Health endpoint reports readiness
- **WHEN** local 开发或测试环境探测 sync 服务端状态
- **THEN** `GET /health` MUST return 可机器 read 的成功响应
- **AND** 调用方 MUST 能据此判断 sync 服务端已可接受请求

#### Scenario: Push stores conversations under current syncKey namespace
- **WHEN** 客户端携带某个 `x-sync-key` 调用 `POST /api/sync/push`
- **THEN** 服务端 MUST only 在该 `syncKey` 命名空间下处理并持久化 conversation
- **AND** 服务端 MUST return 被成功接受的 `processedIds` 与该命名空间的最新 `nextCursor`

#### Scenario: Pull returns only current namespace changes
- **WHEN** 客户端携带某个 `x-sync-key` 调用 `POST /api/sync/pull`
- **THEN** 服务端 MUST 只 return 该 `syncKey` 下 `server_cursor > cursor` 的增量 conversation
- **AND** 服务端 MUST NOT 混入其他 `syncKey` 的 conversation 或游标

### Requirement: Sync server MUST persist conversations in SQLite using conversation aggregates
The system MUST 使用 SQLite 持久化 `Conversation` 聚合对象，而不是在本次变更中拆分出独立 `Message` 表。

#### Scenario: Store conversation aggregate without compare payload
- **WHEN** 服务端接收一条普通聊天 conversation 或已导入 external history
- **THEN** 服务端 MUST 将标准化后的 conversation 聚合对象 write SQLite
- **AND** 服务端 MUST 忽略 `compare` 字段，即使客户端 error 上报也不得持久化

#### Scenario: Maintain per-syncKey monotonic server cursor
- **WHEN** 服务端成功处理一条 enter current 命名空间的 push 数据
- **THEN** 服务端 MUST 为该 `syncKey` 分配单调递增的 `server_cursor`
- **AND** 后续 pull MUST 依据该 `server_cursor` 而不是客户端 `updatedAt` return 增量

### Requirement: Sync server MUST apply last-write-wins conflict resolution
服务端 MUST 使用客户端 `updatedAt` 作为业务时间执行 LWW 冲突处理，并在时间戳相同的情况下采用“delete 优先，否则保留已有版本”的 rule。

#### Scenario: Newer conversation replaces older persisted version
- **WHEN** the same `syncKey + Conversation.id` 收到一条 `updatedAt` 更晚的 conversation
- **THEN** 服务端 MUST 用新版本覆盖旧记录
- **AND** 后续 pull MUST return 覆盖后的版本

#### Scenario: Older conversation does not overwrite newer persisted version
- **WHEN** the same `syncKey + Conversation.id` 收到一条 `updatedAt` 更早的 conversation
- **THEN** 服务端 MUST 忽略该 write
- **AND** return result MUST 不把旧版本当作新变更重新广播

#### Scenario: Deleted conversation wins on equal timestamps
- **WHEN** the same `syncKey + Conversation.id` 的新旧版本 `updatedAt` 相同，但新版本标记为 `deleted = true`
- **THEN** 服务端 MUST 接受 delete 版本覆盖未 delete 版本
- **AND** 后续 pull MUST return `deleted = true` 的版本

### Requirement: Sync server MUST validate syncKey and request payloads
服务端 MUST 校验 `x-sync-key`、请求体结构和 message 字段完整性，并在无效请求时 return 明确的 error 状态。

#### Scenario: Reject empty syncKey
- **WHEN** 客户端未 provide `x-sync-key` 或 provide 空白值
- **THEN** 服务端 MUST return `400`
- **AND** 服务端 MUST NOT 执行任何持久化操作

#### Scenario: Reject default syncKey in non-development environments
- **WHEN** 服务端运行于非开发环境且客户端 provide `syncKey = "0"`
- **THEN** 服务端 MUST return `400`
- **AND** 服务端 MUST prompt default `syncKey=0` 只 allow 在开发环境使用

#### Scenario: Reject malformed conversation payload
- **WHEN** push 请求中的 conversation 缺失 `id`、`title`、`messages` 或 `updatedAt`
- **THEN** 服务端 MUST return `400`
- **AND** 服务端 MUST NOT 部分 write invalid 数据

### Requirement: Sync server MUST support cross-origin access for Web and Extension hosts
由于 sync 服务端以独立应用形态运行，The system MUST provide 面向 Web 与 Extension host 的 CORS 与预检 support。

#### Scenario: Development environment allows configured cross-origin requests
- **WHEN** 开发环境中的 Web 或 Extension host 向 sync 服务端发起跨源请求
- **THEN** 服务端 MUST 正确处理 `OPTIONS` 预检
- **AND** 响应头 MUST allow `content-type` 与 `x-sync-key`

#### Scenario: Production environment rejects unknown origins
- **WHEN** 生产环境收到不在 allowlist 中的跨源请求
- **THEN** 服务端 MUST 拒绝该请求
- **AND** 服务端 MUST NOT 对未授权来源开放通配 CORS

### Requirement: Sync server MUST expose provider remote config endpoints
The system MUST 在现有服务端应用中同时 provide provider remote configuration 分发 interface，以便扩展端拉取 Gemini history selector configuration。

#### Scenario: Fetch Gemini provider config from server
- **WHEN** 客户端请求 Gemini history remote configuration interface
- **THEN** 服务端 MUST return 最新版本的 Gemini configuration JSON
- **AND** 响应 MUST 包含适合客户端 cache 与版本判定的元信息

#### Scenario: Unknown provider config returns not found
- **WHEN** 客户端请求不存在的 provider configuration
- **THEN** 服务端 MUST return `404`
- **AND** 服务端 MUST NOT return 空白成功响应

### Requirement: Sync server MUST accept dedicated conversation delete events
sync 服务端 MUST 在现有 `push` / `pull` 增量 sync 协议中 support 整 conversation delete 事件，用于传播 left-side history list 触发的硬 delete，而不是要求客户端 continue 上传带 tombstone 的完整 conversation 聚合。

#### Scenario: Push hard-delete event for conversation
- **WHEN** 客户端携带某个 `x-sync-key` 调用 `POST /api/sync/push`，且请求中包含一条 conversation delete 事件
- **THEN** 服务端 MUST 接受该 delete 事件并将其纳入 current 命名空间的增量游标
- **AND** 服务端 MUST 不要求客户端同时上报该已 delete conversation 的完整 `Conversation` 载荷

#### Scenario: Pull returns conversation delete events
- **WHEN** 客户端携带某个 `x-sync-key` 调用 `POST /api/sync/pull`
- **THEN** 服务端 MUST return 该命名空间自指定游标之后的 conversation delete 事件
- **AND** 这些 delete 事件 MUST 与普通 conversation 增量一样遵循单调递增的游标顺序

### Requirement: Sync server MUST physically remove deleted conversations from persisted aggregates
服务端在接收到整 conversation delete 事件后 MUST 物理移除 current `syncKey` 下对应的 conversation 聚合记录，而不是把已 delete conversation 长期保留为隐藏 tombstone。

#### Scenario: Hard delete removes persisted conversation aggregate
- **WHEN** 服务端接收到某个 `Conversation.id` 的有效 delete 事件
- **THEN** 服务端 MUST 从 conversation 聚合存储中移除该记录
- **AND** 后续针对该 `Conversation.id` 的 read 或增量 conversation result MUST 不再包含该 conversation 聚合

#### Scenario: Delete event is still visible to other clients after hard delete
- **WHEN** 一条 conversation 已在服务端物理 delete，但其他客户端尚未 pull 到该 delete result
- **THEN** 服务端 MUST continue 保留该 delete 事件直到相关客户端能够通过游标 read
- **AND** 服务端 MUST NOT 因 conversation 聚合已被 delete 而丢失 delete 广播 capability

### Requirement: Sync server MUST resolve delete events with updatedAt-aware ordering
服务端 MUST 使用 delete 事件携带的 `updatedAt` 与现有 conversation 版本执行时间比较，确保旧 delete 不会覆盖 update 的 conversation 版本，而有效 delete 可以稳定清除较旧记录。

#### Scenario: Newer delete event removes older stored conversation
- **WHEN** 服务端已持久化一条 conversation，随后收到 the same `Conversation.id` 且 `updatedAt` 更晚的 delete 事件
- **THEN** 服务端 MUST 接受该 delete 事件并 delete 已存 conversation
- **AND** 后续 pull MUST 将该 delete 事件作为最新状态 return

#### Scenario: Older delete event does not remove newer stored conversation
- **WHEN** 服务端已持久化一条较新的 conversation 版本，但随后收到 the same `Conversation.id` 且 `updatedAt` 更早的 delete 事件
- **THEN** 服务端 MUST 忽略该 delete 事件对 current conversation 的覆盖
- **AND** 服务端 MUST 不把该陈旧 delete 广播为最新变更

### Requirement: Sync server MUST expose context HTTP endpoints that preserve IContextProvider semantics
服务端 MUST 在现有应用内 provide `/api/context` capability，并将 `IContextProvider` 的 `initializeAccess`、`getContext`、`getConversations`、`readDocument`、`writeDocument`、`createNode`、`deleteNode`、`renameNode`、`searchInScope` 语义通过 HTTP 端点 expose 给 browser 端。该 contract MUST 优先保证与共享 interface 命名一致，而不是重建另一套资源型 REST 语义。

#### Scenario: Initialize remote context access
- **WHEN** Web host 首次 enter knowledge workspace 并调用远端 context provider
- **THEN** 服务端 MUST 处理 `/api/context/initialize-access`
- **AND** 该响应 MUST 足以让 browser 端 continue 执行后续 directory 树、document 和 document conversation 请求

#### Scenario: Read write and manage nodes through endpoint methods
- **WHEN** browser 端请求 directory 树、document read、document write、节点 create、节点 delete 或节点 rename
- **THEN** 服务端 MUST 通过 `/api/context` 下与 `getContext`、`readDocument`、`writeDocument`、`createNode`、`deleteNode`、`renameNode` 对应的 endpoint 处理这些请求
- **AND** `readDocument` 的 result MUST 至少包含 `path`、`mimeType` 与 `dataBase64`
- **AND** `writeDocument` MUST 接受与共享 `WriteContextDocumentInput` 一致的 input 语义

#### Scenario: Serve PDF through the same readDocument endpoint
- **WHEN** browser 端请求 read 一个 PDF document
- **THEN** 服务端 MUST continue 通过 `readDocument` return 该 document
- **AND** 服务端 MUST NOT 额外要求 browser 端调用独立的 `readBinaryDocument` endpoint

#### Scenario: Return document-scoped conversations through the context API
- **WHEN** browser 端请求某个 document 的关联 conversation list
- **THEN** 服务端 MUST 通过 `/api/context/get-conversations` return result
- **AND** browser 端 MUST 通过 `getConversations({ documentPath })` 表达该 query
- **AND** return result MUST 只包含 `documentPaths` 精确包含目标路径的 conversation

### Requirement: Sync server MUST preserve conversation document associations in sync payloads
sync 服务端 MUST 在 push / pull 协议与持久化聚合对象中完整保留 conversation 级 `documentPaths` 字段，使客户端能够在跨设备 sync 后 continue 按 document 聚合相关 conversation。

#### Scenario: Store document paths on pushed conversations
- **WHEN** 客户端上报一条包含 `documentPaths` 的普通聊天 conversation
- **THEN** 服务端 MUST 将这些路径作为 conversation 聚合的一部分 save
- **AND** 后续 pull MUST return 相同的 `documentPaths`

#### Scenario: Preserve compatibility for pushed conversations without document paths
- **WHEN** 客户端上报一条未包含 `documentPaths` 的旧 conversation
- **THEN** 服务端 MUST allow 该字段缺省
- **AND** 服务端 MUST NOT 因字段缺失拒绝该 conversation

### Requirement: Sync server MUST keep backend implementation swappable behind the same context contract
服务端 MUST allow `/api/context` 背后的具体实现从临时 local 文件后端演进到数据库后端，而不要求 browser 端修改调用契约。

#### Scenario: Serve context data from a local file backend
- **WHEN** 服务端 current 使用 `LocalFileContextProvider`
- **THEN** 服务端 MAY 从 `CHATPRISM_KNOWLEDGE_ROOT` 指定的根路径 read 和 write 上下文数据
- **AND** 所有访问 MUST 被约束在该 provider 定义的边界内

#### Scenario: Replace the backend without changing browser contract
- **WHEN** 服务端将 `/api/context` 的底层实现从 `LocalFileContextProvider` switch 为 `DatabaseContextProvider`
- **THEN** browser 端调用的 endpoint 路径和请求语义 MUST keep 不变
- **AND** 不同 the user 的 context 映射 MAY 在新的 provider 内部实现

### Requirement: Sync server MUST expose task sync endpoints with an independent cursor
The sync server SHALL provide task push and pull endpoints under the sync namespace (`/api/sync/tasks/push`, `/api/sync/tasks/pull`), scoped by `x-sync-key` like conversation sync, with a task-resource cursor independent from the conversation cursor. Existing conversation endpoints MUST remain unchanged.

#### Scenario: Task pull is incremental and namespaced
- **WHEN** a client pulls tasks with a cursor under a given `syncKey`
- **THEN** the server MUST return only task records for that `syncKey` newer than the cursor plus the next cursor
- **AND** conversation cursors MUST NOT be affected by task sync traffic

#### Scenario: Conversation contract is untouched
- **WHEN** an existing client uses only conversation push/pull
- **THEN** its behavior MUST be identical to before task endpoints existed

### Requirement: Sync server MUST apply last-write-wins and whitelist normalization to tasks
Task pushes SHALL be validated, normalized through an explicit task field whitelist, and merged per task id by `updatedAt` (newer wins). Invalid payloads MUST be rejected without partial writes.

#### Scenario: Stale task push does not overwrite newer record
- **WHEN** a pushed task has an older `updatedAt` than the stored record
- **THEN** the server MUST keep the stored record
- **AND** the push response MUST still succeed for the batch
