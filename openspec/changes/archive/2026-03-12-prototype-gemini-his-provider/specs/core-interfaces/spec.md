## MODIFIED Requirements

### Requirement: Conversation model MUST support imported-source metadata
系统 MUST 为 `Conversation` 数据模型提供来源标识、外部记录标识、同步元数据以及结构化消息内容，以支持导入去重、来源展示、外部历史续聊、Local-First 同步和多模态消息恢复。来源标识 MUST 使用统一的 `origin` 字段，而不是并行维护多套来源枚举。

#### Scenario: Store imported conversation metadata
- **WHEN** 系统表示一条来自外部平台或外部文件导入的历史会话
- **THEN** `Conversation` MUST 支持 `origin` 与 `externalId` 字段
- **AND** 系统 MUST 允许 `backendId` 与 `externalId` 同时保留，以区分本地标识和远端续聊标识

#### Scenario: Store sync metadata on conversation
- **WHEN** 系统保存一条需要参与同步的本地会话
- **THEN** `Conversation` MUST 支持 `dirty`、`deleted`、`syncedAt` 或等价同步状态字段
- **AND** 这些字段 MUST 能被存储实现无损保存与读取

#### Scenario: Store structured conversation messages
- **WHEN** 系统保存一条包含多模态消息或标准化注解的会话
- **THEN** `Conversation.messages` MUST 支持保留消息 `content`、`attachments` 与 `annotations`
- **AND** 这些结构化消息字段 MUST 能在会话恢复后被无损读取

### Requirement: Define IStorageProvider Interface
系统 MUST 定义 `IStorageProvider` 接口契约，为所有数据持久化提供标准的数据存取操作，并保证实现可以无损保存与读取包含来源元数据、同步元数据以及结构化消息内容的 `Conversation`。

#### Scenario: Validate IStorageProvider structure
- **WHEN** 开发者实现一个新的数据存储提供者时
- **THEN** 该实现 MUST 包含 `id` 属性，以及 `saveConversation`、`getConversation`、`getAllConversations` 和 `deleteConversation` 此四个核心方法
- **AND** 这些方法处理的 `Conversation` 数据 MUST 支持保留 `backendId`、`origin`、`externalId`、`dirty`、`deleted`、`syncedAt` 以及消息级 `attachments`/`annotations` 而不被丢弃

## ADDED Requirements

### Requirement: External history contracts MUST identify provider origin consistently
系统 MUST 通过统一的 provider 标识体系描述外部历史来源，使 UI 状态、摘要数据与持久化会话都能复用同一组 provider ID。

#### Scenario: Use provider ID as shared origin token
- **WHEN** 外部历史 provider 返回摘要或详情数据
- **THEN** 系统 MUST 使用 `chatgpt-web`、`gemini-web` 或 `external-file` 这一类统一 provider ID 表示来源
- **AND** UI 工作台状态与 `Conversation.origin` MUST 能直接消费这些 provider ID 而不需要额外映射一套平行命名
