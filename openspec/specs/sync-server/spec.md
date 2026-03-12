## ADDED Requirements

### Requirement: Sync server MUST provide namespaced incremental sync APIs
系统 MUST 在仓库内提供独立的同步服务端应用，为 Web 与 Extension 宿主暴露真实的 `POST /api/sync/push`、`POST /api/sync/pull` 和 `GET /health` 接口。

#### Scenario: Health endpoint reports readiness
- **WHEN** 本地开发或测试环境探测同步服务端状态
- **THEN** `GET /health` MUST 返回可机器读取的成功响应
- **AND** 调用方 MUST 能据此判断同步服务端已可接受请求

#### Scenario: Push stores conversations under current syncKey namespace
- **WHEN** 客户端携带某个 `x-sync-key` 调用 `POST /api/sync/push`
- **THEN** 服务端 MUST 仅在该 `syncKey` 命名空间下处理并持久化会话
- **AND** 服务端 MUST 返回被成功接受的 `processedIds` 与该命名空间的最新 `nextCursor`

#### Scenario: Pull returns only current namespace changes
- **WHEN** 客户端携带某个 `x-sync-key` 调用 `POST /api/sync/pull`
- **THEN** 服务端 MUST 只返回该 `syncKey` 下 `server_cursor > cursor` 的增量会话
- **AND** 服务端 MUST NOT 混入其他 `syncKey` 的会话或游标

### Requirement: Sync server MUST persist conversations in SQLite using conversation aggregates
系统 MUST 使用 SQLite 持久化 `Conversation` 聚合对象，而不是在本次变更中拆分出独立 `Message` 表。

#### Scenario: Store conversation aggregate without compare payload
- **WHEN** 服务端接收一条普通聊天会话或已导入外部历史
- **THEN** 服务端 MUST 将标准化后的会话聚合对象写入 SQLite
- **AND** 服务端 MUST 忽略 `compare` 字段，即使客户端错误上报也不得持久化

#### Scenario: Maintain per-syncKey monotonic server cursor
- **WHEN** 服务端成功处理一条进入当前命名空间的 push 数据
- **THEN** 服务端 MUST 为该 `syncKey` 分配单调递增的 `server_cursor`
- **AND** 后续 pull MUST 依据该 `server_cursor` 而不是客户端 `updatedAt` 返回增量

### Requirement: Sync server MUST apply last-write-wins conflict resolution
服务端 MUST 使用客户端 `updatedAt` 作为业务时间执行 LWW 冲突处理，并在时间戳相同的情况下采用“删除优先，否则保留已有版本”的规则。

#### Scenario: Newer conversation replaces older persisted version
- **WHEN** 同一 `syncKey + Conversation.id` 收到一条 `updatedAt` 更晚的会话
- **THEN** 服务端 MUST 用新版本覆盖旧记录
- **AND** 后续 pull MUST 返回覆盖后的版本

#### Scenario: Older conversation does not overwrite newer persisted version
- **WHEN** 同一 `syncKey + Conversation.id` 收到一条 `updatedAt` 更早的会话
- **THEN** 服务端 MUST 忽略该写入
- **AND** 返回结果 MUST 不把旧版本当作新变更重新广播

#### Scenario: Deleted conversation wins on equal timestamps
- **WHEN** 同一 `syncKey + Conversation.id` 的新旧版本 `updatedAt` 相同，但新版本标记为 `deleted = true`
- **THEN** 服务端 MUST 接受删除版本覆盖未删除版本
- **AND** 后续 pull MUST 返回 `deleted = true` 的版本

### Requirement: Sync server MUST validate syncKey and request payloads
服务端 MUST 校验 `x-sync-key`、请求体结构和消息字段完整性，并在无效请求时返回明确的错误状态。

#### Scenario: Reject empty syncKey
- **WHEN** 客户端未提供 `x-sync-key` 或提供空白值
- **THEN** 服务端 MUST 返回 `400`
- **AND** 服务端 MUST NOT 执行任何持久化操作

#### Scenario: Reject default syncKey in non-development environments
- **WHEN** 服务端运行于非开发环境且客户端提供 `syncKey = "0"`
- **THEN** 服务端 MUST 返回 `400`
- **AND** 服务端 MUST 提示默认 `syncKey=0` 只允许在开发环境使用

#### Scenario: Reject malformed conversation payload
- **WHEN** push 请求中的会话缺失 `id`、`title`、`messages` 或 `updatedAt`
- **THEN** 服务端 MUST 返回 `400`
- **AND** 服务端 MUST NOT 部分写入非法数据

### Requirement: Sync server MUST support cross-origin access for Web and Extension hosts
由于同步服务端以独立应用形态运行，系统 MUST 提供面向 Web 与 Extension 宿主的 CORS 与预检支持。

#### Scenario: Development environment allows configured cross-origin requests
- **WHEN** 开发环境中的 Web 或 Extension 宿主向同步服务端发起跨源请求
- **THEN** 服务端 MUST 正确处理 `OPTIONS` 预检
- **AND** 响应头 MUST 允许 `content-type` 与 `x-sync-key`

#### Scenario: Production environment rejects unknown origins
- **WHEN** 生产环境收到不在 allowlist 中的跨源请求
- **THEN** 服务端 MUST 拒绝该请求
- **AND** 服务端 MUST NOT 对未授权来源开放通配 CORS

### Requirement: Sync server MUST expose provider remote config endpoints
系统 MUST 在现有服务端应用中同时提供 provider 远程配置分发接口，以便扩展端拉取 Gemini 历史选择器配置。

#### Scenario: Fetch Gemini provider config from server
- **WHEN** 客户端请求 Gemini 历史远程配置接口
- **THEN** 服务端 MUST 返回最新版本的 Gemini 配置 JSON
- **AND** 响应 MUST 包含适合客户端缓存与版本判定的元信息

#### Scenario: Unknown provider config returns not found
- **WHEN** 客户端请求不存在的 provider 配置
- **THEN** 服务端 MUST 返回 `404`
- **AND** 服务端 MUST NOT 返回空白成功响应
