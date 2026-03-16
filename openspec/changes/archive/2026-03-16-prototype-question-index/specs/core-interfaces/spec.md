## MODIFIED Requirements

### Requirement: Conversation model MUST support imported-source metadata
系统 MUST 为 `Conversation` 数据模型提供来源标识、外部记录标识、同步元数据、结构化消息内容以及问题索引相关的消息级元数据，以支持导入去重、来源展示、外部历史续聊、Local-First 同步、多模态消息恢复以及长对话中的问答对管理。来源标识 MUST 使用统一的 `origin` 字段，而不是并行维护多套来源枚举。

#### Scenario: Store imported conversation metadata
- **WHEN** 系统表示一条来自外部平台或外部文件导入的历史会话
- **THEN** `Conversation` MUST 支持 `origin` 与 `externalId` 字段
- **AND** 系统 MUST 允许 `backendId` 与 `externalId` 同时保留，以区分本地标识和远端续聊标识

#### Scenario: Store sync metadata on conversation
- **WHEN** 系统保存一条需要参与同步的本地会话
- **THEN** `Conversation` MUST 支持 `dirty`、`deleted`、`syncedAt` 或等价同步状态字段
- **AND** 这些字段 MUST 能被存储实现无损保存与读取

#### Scenario: Store structured conversation messages
- **WHEN** 系统保存一条包含多模态消息、标准化注解或问题索引元数据的会话
- **THEN** `Conversation.messages` MUST 支持保留消息 `content`、`attachments`、`annotations`、`questionId`、`starred`、`deleted` 与 `createdAt`
- **AND** 这些结构化消息字段 MUST 能在会话恢复后被无损读取

### Requirement: Define IStorageProvider Interface
系统 MUST 定义 `IStorageProvider` 接口契约，为所有数据持久化提供标准的数据存取操作，并保证实现可以无损保存与读取包含来源元数据、同步元数据、结构化消息内容以及问题索引元数据的 `Conversation`。

#### Scenario: Validate IStorageProvider structure
- **WHEN** 开发者实现一个新的数据存储提供者时
- **THEN** 该实现 MUST 包含 `id` 属性，以及 `saveConversation`、`getConversation`、`getAllConversations` 和 `deleteConversation` 此四个核心方法
- **AND** 这些方法处理的 `Conversation` 数据 MUST 支持保留 `backendId`、`origin`、`externalId`、`dirty`、`deleted`、`syncedAt` 以及消息级 `attachments`、`annotations`、`questionId`、`starred`、`deleted`、`createdAt` 而不被丢弃

## ADDED Requirements

### Requirement: Conversation message metadata MUST support question-pair operations
系统 MUST 为消息模型定义稳定的问答对元数据，使用户问题与紧随其后的助手回复可以通过共享标识进行联动操作。该元数据 MUST 允许 UI 和存储层在不额外维护侧表的情况下完成星标、软删除、滚动定位和本地可见过滤。

#### Scenario: Link user and assistant messages by question ID
- **WHEN** 用户发送一条新的问题并触发助手回复
- **THEN** 系统 MUST 为该用户消息和对应助手消息写入相同的 `questionId`
- **AND** 后续星标或软删除操作 MUST 可以基于该 `questionId` 同时定位这一组问答消息

#### Scenario: Preserve compatibility for legacy messages
- **WHEN** 系统读取旧会话中未包含 `questionId`、`starred`、`deleted` 或 `createdAt` 的消息
- **THEN** 系统 MUST 允许这些字段缺省
- **AND** 旧消息 MUST 继续被视为未星标、未删除的普通消息进行渲染
