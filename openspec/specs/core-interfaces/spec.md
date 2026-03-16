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

### Requirement: External history contracts MUST identify provider origin consistently
系统 MUST 通过统一的 provider 标识体系描述外部历史来源，使 UI 状态、摘要数据与持久化会话都能复用同一组 provider ID。

#### Scenario: Use provider ID as shared origin token
- **WHEN** 外部历史 provider 返回摘要或详情数据
- **THEN** 系统 MUST 使用 `chatgpt-web`、`gemini-web` 或 `external-file` 这一类统一 provider ID 表示来源
- **AND** UI 工作台状态与 `Conversation.origin` MUST 能直接消费这些 provider ID 而不需要额外映射一套平行命名

## ADDED Requirements

### Requirement: Define multimodal model provider interface
系统 MUST 定义统一的 `IModelProvider` 契约，用于描述支持附件输入与标准化流式输出的模型提供者能力。

#### Scenario: Validate sendMessage structure
- **WHEN** 开发者实现一个新的模型提供者
- **THEN** 该实现的 `sendMessage` 接口 MUST 支持接收 `prompt`、`modelId`、会话上下文以及附件列表
- **AND** 其返回值 MUST 包含最终 `text`、`conversationId`、`messageId` 以及可选的最终 `annotations`

### Requirement: Define standardized provider stream update contract
系统 MUST 为模型提供者定义统一的流式更新结构，使 UI、代理层和存储层都只消费标准化后的 `text + annotations` 快照。

#### Scenario: Provider emits normalized snapshot update
- **WHEN** 模型提供者以流式方式返回助手消息
- **THEN** 每次 `onUpdate` 回调 MUST 返回当前完整正文快照 `text`
- **AND** 若该快照包含增强语义，提供者 MUST 以 `annotations` 描述正文中的一段文本或某个渲染位置的结构化语义

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
