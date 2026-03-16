## ADDED Requirements

### Requirement: Storage providers MUST preserve question index metadata across save and load
存储实现 MUST 在保存和读取会话时无损保留消息级问题索引元数据，包括 `questionId`、`starred`、`deleted` 与 `createdAt`。这些字段 MUST 与既有的正文、附件和注解一起被持久化，而不是只存在于运行时内存中。

#### Scenario: Persist question metadata in conversation messages
- **WHEN** 存储实现保存一条包含问题索引元数据的会话
- **THEN** 后续读取该会话时，每条消息的 `questionId`、`starred`、`deleted` 与 `createdAt` MUST 保持不变
- **AND** 系统 MUST 不丢失消息原有的 `content`、`attachments` 与 `annotations`

### Requirement: Storage providers MUST keep soft-deleted question pairs recoverable in raw conversation data
存储实现 MUST 将问答对删除视为消息级软删除，而不是在保存时物理移除消息节点。这样系统才能在后续同步、审计或未来的撤销删除能力中继续访问原始消息顺序与内容。

#### Scenario: Save conversation with deleted question pair
- **WHEN** 某个 `questionId` 对应的用户问题和助手回复被标记为 `deleted = true`
- **THEN** 存储实现 MUST 继续保留这两条消息在 `Conversation.messages` 中的原始顺序
- **AND** 系统 MUST 不因保存流程而将其从原始会话结构中直接移除

### Requirement: Storage providers MUST hard-delete whole conversations removed from sidebar history
存储实现 MUST 将左侧历史列表触发的整会话删除视为 `Conversation` 级别的硬删除，而不是复用消息级软删除语义。调用 `deleteConversation(id)` 后，该会话 MUST 从本地会话集合中物理移除，不再作为隐藏记录继续保留。

#### Scenario: Physically remove deleted local conversation
- **WHEN** UI 对某条本地会话调用 `deleteConversation(id)`
- **THEN** 存储实现 MUST 删除该 `Conversation` 聚合及其消息内容
- **AND** 后续 `getConversation(id)` 与 `getAllConversations()` MUST 不再返回该会话

#### Scenario: Keep question soft delete separate from conversation hard delete
- **WHEN** 某条会话仅包含消息级 `deleted = true` 的问答对，但用户未执行整会话删除
- **THEN** 存储实现 MUST 继续保留该会话本身
- **AND** 系统 MUST NOT 因消息级软删除而触发 `deleteConversation(id)` 的物理删除效果
