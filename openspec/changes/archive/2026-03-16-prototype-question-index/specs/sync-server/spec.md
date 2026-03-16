## ADDED Requirements

### Requirement: Sync server MUST accept dedicated conversation delete events
同步服务端 MUST 在现有 `push` / `pull` 增量同步协议中支持整会话删除事件，用于传播左侧历史列表触发的硬删除，而不是要求客户端继续上传带 tombstone 的完整会话聚合。

#### Scenario: Push hard-delete event for conversation
- **WHEN** 客户端携带某个 `x-sync-key` 调用 `POST /api/sync/push`，且请求中包含一条会话删除事件
- **THEN** 服务端 MUST 接受该删除事件并将其纳入当前命名空间的增量游标
- **AND** 服务端 MUST 不要求客户端同时上报该已删除会话的完整 `Conversation` 载荷

#### Scenario: Pull returns conversation delete events
- **WHEN** 客户端携带某个 `x-sync-key` 调用 `POST /api/sync/pull`
- **THEN** 服务端 MUST 返回该命名空间自指定游标之后的会话删除事件
- **AND** 这些删除事件 MUST 与普通会话增量一样遵循单调递增的游标顺序

### Requirement: Sync server MUST physically remove deleted conversations from persisted aggregates
服务端在接收到整会话删除事件后 MUST 物理移除当前 `syncKey` 下对应的会话聚合记录，而不是把已删除会话长期保留为隐藏 tombstone。

#### Scenario: Hard delete removes persisted conversation aggregate
- **WHEN** 服务端接收到某个 `Conversation.id` 的有效删除事件
- **THEN** 服务端 MUST 从会话聚合存储中移除该记录
- **AND** 后续针对该 `Conversation.id` 的读取或增量会话结果 MUST 不再包含该会话聚合

#### Scenario: Delete event is still visible to other clients after hard delete
- **WHEN** 一条会话已在服务端物理删除，但其他客户端尚未 pull 到该删除结果
- **THEN** 服务端 MUST 继续保留该删除事件直到相关客户端能够通过游标读取
- **AND** 服务端 MUST NOT 因会话聚合已被删除而丢失删除广播能力

### Requirement: Sync server MUST resolve delete events with updatedAt-aware ordering
服务端 MUST 使用删除事件携带的 `updatedAt` 与现有会话版本执行时间比较，确保旧删除不会覆盖更新的会话版本，而有效删除可以稳定清除较旧记录。

#### Scenario: Newer delete event removes older stored conversation
- **WHEN** 服务端已持久化一条会话，随后收到同一 `Conversation.id` 且 `updatedAt` 更晚的删除事件
- **THEN** 服务端 MUST 接受该删除事件并删除已存会话
- **AND** 后续 pull MUST 将该删除事件作为最新状态返回

#### Scenario: Older delete event does not remove newer stored conversation
- **WHEN** 服务端已持久化一条较新的会话版本，但随后收到同一 `Conversation.id` 且 `updatedAt` 更早的删除事件
- **THEN** 服务端 MUST 忽略该删除事件对当前会话的覆盖
- **AND** 服务端 MUST 不把该陈旧删除广播为最新变更
