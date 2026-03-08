## MODIFIED Requirements

### Requirement: IndexedDB Conversation Storage
系统 MUST 基于 IndexedDB 实现在浏览器环境中对对话数据的持久化存取，并在保存与读取时完整保留会话来源元数据与扩展字段。

#### Scenario: Save and retrieve a conversation
- **WHEN** 调用 `saveConversation` 保存一个包含多条消息的对话对象后，使用该对象的 ID 调用 `getConversation`
- **THEN** 系统 MUST 返回完整的对话对象，包括更新时间及所有 `role` 和 `content` 不变的聊天记录
- **AND** 系统 MUST 保留 `backendId`、`sourceType`、`externalId` 与 `compare` 等会话元数据

#### Scenario: List imported conversations with source metadata
- **WHEN** 调用 `getAllConversations` 读取包含本地会话和已导入外部会话的列表
- **THEN** 系统 MUST 返回保留 `sourceType` 与 `externalId` 字段的完整会话集合
- **AND** 返回结果 MUST 继续按照 `updatedAt` 倒序排列
