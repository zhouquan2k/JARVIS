## MODIFIED Requirements

### Requirement: Conversation model MUST support imported-source metadata
系统 MUST 为 `Conversation` 数据模型提供来源标识、外部记录标识、同步元数据以及结构化消息内容，以支持导入去重、来源展示、外部历史续聊、Local-First 同步和多模态消息恢复。

#### Scenario: Store imported conversation metadata
- **WHEN** 系统表示一条来自外部平台的历史会话
- **THEN** `Conversation` MUST 支持 `sourceType` 与 `externalId` 字段
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
- **AND** 这些方法处理的 `Conversation` 数据 MUST 支持保留 `backendId`、`sourceType`、`externalId`、`dirty`、`deleted`、`syncedAt` 以及消息级 `attachments`/`annotations` 而不被丢弃

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
