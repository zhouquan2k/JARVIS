## ADDED Requirements

### Requirement: Define IHistoryProvider Interface
系统 MUST 定义独立的 `IHistoryProvider` 接口契约，用于承载远端历史列表与详情读取能力，不得与 `IModelProvider` 的消息发送职责耦合。

#### Scenario: Validate IHistoryProvider structure
- **WHEN** 开发者实现一个新的外部历史提供者时
- **THEN** 该实现 MUST 包含 `id` 属性以及 `getHistoryList`、`getHistoryDetail` 两个核心方法
- **AND** `getHistoryDetail` MUST 返回统一的 `Conversation` 数据结构而不是宿主特定原始响应

### Requirement: Conversation model MUST support imported-source metadata
系统 MUST 为 `Conversation` 数据模型提供来源标识与外部记录标识，以支持导入去重、来源展示和外部历史续聊。

#### Scenario: Store imported conversation metadata
- **WHEN** 系统表示一条来自外部平台的历史会话
- **THEN** `Conversation` MUST 支持 `sourceType` 与 `externalId` 字段
- **AND** 系统 MUST 允许 `backendId` 与 `externalId` 同时保留，以区分本地标识和远端续聊标识

### Requirement: IModelProvider MUST expose provider-driven model catalog
系统 MUST 允许 `IModelProvider` 直接返回其当前可用模型目录，以替代 UI 对静态 `models/defaultModel` 的直接依赖。

#### Scenario: Validate IModelProvider model catalog structure
- **WHEN** 开发者实现一个新的模型 provider
- **THEN** 该实现 MUST 在 `IModelProvider` 上提供 `getAvailableModels()` 方法
- **AND** 该方法 MUST 返回包含 `models` 与 `defaultModel` 的结果
- **AND** 返回的 `defaultModel` MUST 命中返回的模型集合

## MODIFIED Requirements

### Requirement: Define IStorageProvider Interface
系统 MUST 定义 `IStorageProvider` 接口契约，为所有数据持久化提供标准的数据存取操作，并保证实现可以无损保存与读取包含来源元数据的 `Conversation`。

#### Scenario: Validate IStorageProvider structure
- **WHEN** 开发者实现一个新的数据存储提供者时
- **THEN** 该实现 MUST 包含 `id` 属性，以及 `saveConversation`、`getConversation`、`getAllConversations` 和 `deleteConversation` 此四个核心方法
- **AND** 这些方法处理的 `Conversation` 数据 MUST 支持保留 `backendId`、`sourceType`、`externalId` 等会话元数据而不被丢弃
