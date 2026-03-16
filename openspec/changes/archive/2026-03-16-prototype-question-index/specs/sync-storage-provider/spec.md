## ADDED Requirements

### Requirement: Sync storage provider MUST preserve question metadata through local-first sync
同步存储实现 MUST 在本地保存、增量 push、远端 pull 和启动补偿过程中完整保留消息级问题索引元数据，包括 `questionId`、`starred`、`deleted` 与 `createdAt`。这些字段 MUST 随 `Conversation.messages` 一起同步，而不是仅保留在当前设备本地。

#### Scenario: Push and pull question metadata without loss
- **WHEN** 本地会话中的消息包含 `questionId`、`starred`、`deleted` 或 `createdAt`
- **THEN** 同步存储实现 MUST 在 push 到远端后仍能在后续 pull 结果中恢复这些字段
- **AND** 多端读取到的会话消息 MUST 保持一致的问题索引元数据

### Requirement: Sync storage provider MUST not conflate message soft delete with conversation deletion
同步存储实现 MUST 区分“消息级问答对软删除”和“整条会话删除”这两种语义。消息级 `deleted` 仅表示该问答对应从主线程渲染与本地索引中过滤；它 MUST NOT 被错误提升为 `conversation.sync.deleted` 或触发整会话的远端删除广播。

#### Scenario: Sync a conversation containing deleted question pairs
- **WHEN** 会话中某个 `questionId` 下的消息被标记为消息级 `deleted = true`，但整条会话仍然有效
- **THEN** 同步存储实现 MUST 继续同步该会话本身
- **AND** 系统 MUST NOT 将该状态解释为整条会话已被删除

### Requirement: Sync storage provider MUST propagate hard-deleted conversations as delete events
同步存储实现 MUST 将左侧历史列表触发的整会话删除作为独立删除事件进行 push / pull，而不是继续依赖长期保留的 `conversation.sync.deleted` tombstone。删除事件一旦被远端确认，本地普通会话列表中 MUST 不再保留该会话。

#### Scenario: Push deleted conversation as dedicated sync event
- **WHEN** 用户从左侧本地历史列表删除一条会话
- **THEN** 同步存储实现 MUST 立即从本地会话集合中移除该会话
- **AND** 系统 MUST 在后续 push 中上报该会话的独立删除事件，而不是把已删除会话作为普通 `Conversation` 再次保存

#### Scenario: Pull remote delete event and remove local conversation
- **WHEN** 其他客户端已删除某条会话，当前客户端在 pull 结果中收到该会话的删除事件
- **THEN** 同步存储实现 MUST 删除本地对应会话
- **AND** 本地历史列表 MUST 不再展示该会话

#### Scenario: Ignore stale delete event when local conversation is newer
- **WHEN** 当前客户端本地存在同一 `Conversation.id` 的更晚版本，而 pull 返回的删除事件时间早于该本地版本
- **THEN** 同步存储实现 MUST 忽略该陈旧删除事件
- **AND** 后续同步 MUST 允许本地较新版本继续参与 push
