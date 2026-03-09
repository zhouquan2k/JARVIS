## MODIFIED Requirements

### Requirement: Conversation model MUST support imported-source metadata
系统 MUST 为 `Conversation` 数据模型提供来源标识、外部记录标识以及同步元数据，以支持导入去重、来源展示、外部历史续聊和 Local-First 同步状态管理。

#### Scenario: Store imported conversation metadata
- **WHEN** 系统表示一条来自外部平台的历史会话
- **THEN** `Conversation` MUST 支持 `sourceType` 与 `externalId` 字段
- **AND** 系统 MUST 允许 `backendId` 与 `externalId` 同时保留，以区分本地标识和远端续聊标识

#### Scenario: Store sync metadata on conversation
- **WHEN** 系统保存一条需要参与同步的本地会话
- **THEN** `Conversation` MUST 支持 `dirty`、`deleted`、`syncedAt` 或等价同步状态字段
- **AND** 这些字段 MUST 能被存储实现无损保存与读取

### Requirement: Define IStorageProvider Interface
系统 MUST 定义 `IStorageProvider` 接口契约，为所有数据持久化提供标准的数据存取操作，并保证实现可以无损保存与读取包含来源元数据和同步元数据的 `Conversation`。

#### Scenario: Validate IStorageProvider structure
- **WHEN** 开发者实现一个新的数据存储提供者时
- **THEN** 该实现 MUST 包含 `id` 属性，以及 `saveConversation`、`getConversation`、`getAllConversations` 和 `deleteConversation` 此四个核心方法
- **AND** 这些方法处理的 `Conversation` 数据 MUST 支持保留 `backendId`、`sourceType`、`externalId`、`dirty`、`deleted`、`syncedAt` 等会话元数据而不被丢弃

## ADDED Requirements

### Requirement: Define sync transport interface
系统 MUST 定义独立的同步传输契约，用于描述面向远端同步服务的 `pull` 与 `push` 能力，并允许在不耦合具体宿主实现的前提下按 `syncKey` 隔离数据命名空间。

#### Scenario: Validate sync transport structure
- **WHEN** 开发者实现一个新的同步传输层时
- **THEN** 该实现 MUST 提供 `pull` 与 `push` 两个核心方法
- **AND** 这两个方法 MUST 在当前 `syncKey` 上下文内工作，而不是混用其他命名空间的数据

