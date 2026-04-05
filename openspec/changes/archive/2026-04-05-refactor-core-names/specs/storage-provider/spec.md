## MODIFIED Requirements

### Requirement: Storage providers MUST preserve sync metadata across CRUD operations
系统 MUST 保证支持同步的存储实现能够无损保存与读取 `Conversation` 的同步元数据，并在列表与详情读取时维持与本地会话一致的排序和内容完整性。承载该能力的主接口命名 MUST 收敛为 `IConversationPersistProvider`，而不是继续以泛化的 `IStorageProvider` 作为会话持久化契约名。

#### Scenario: Persist conversation through the canonical persist contract
- **WHEN** 任一宿主或同步组件请求保存一条会话
- **THEN** 系统 MUST 通过 `IConversationPersistProvider.saveConversation(chat)` 执行持久化
- **AND** 后续读取该会话时 MUST 继续返回完整同步元数据与消息内容

### Requirement: Storage providers MUST hard-delete whole conversations removed from sidebar history
存储实现 MUST 将左侧历史列表触发的整会话删除视为 `Conversation` 级别的硬删除，而不是复用消息级软删除语义。调用 `deleteConversation(id)` 后，该会话 MUST 从本地会话集合中物理移除，不再作为隐藏记录继续保留。该删除语义在接口重命名后 MUST 保持不变。

#### Scenario: Rename storage interface without changing delete semantics
- **WHEN** 调用方从旧命名迁移到 `IConversationPersistProvider`
- **THEN** `deleteConversation(id)` MUST 继续物理删除目标会话
- **AND** 后续 `getConversation(id)` 与 `getAllConversations()` MUST 不再返回该会话
