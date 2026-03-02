## ADDED Requirements

### Requirement: IndexedDB Conversation Storage
系统 MUST 基于 IndexedDB 实现在浏览器环境中对对话数据的持久化存取。

#### Scenario: Save and retrieve a conversation
- **WHEN** 调用 `saveConversation` 保存一个包含多条消息的对话对象后，使用该对象的 ID 调用 `getConversation`
- **THEN** 系统 MUST 返回完整的对话对象，包括更新时间及所有 `role` 和 `content` 不变的聊天记录
