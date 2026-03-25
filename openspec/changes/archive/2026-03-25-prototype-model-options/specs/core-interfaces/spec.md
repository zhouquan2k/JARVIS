## MODIFIED Requirements

### Requirement: Conversation model MUST support imported-source metadata
系统 MUST 为 `Conversation` 数据模型提供来源标识、外部记录标识、同步元数据、结构化消息内容、问题索引相关的消息级元数据以及会话级模型选择元数据，以支持导入去重、来源展示、外部历史续聊、Local-First 同步、多模态消息恢复、长对话中的问答对管理以及普通聊天的会话级模型配置恢复。来源标识 MUST 使用统一的 `origin` 字段，而不是并行维护多套来源枚举。

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

#### Scenario: Store conversation model selection
- **WHEN** 系统保存一条普通聊天会话，并为后续消息记录当前 `providerId`、`modelId` 与模型功能开关
- **THEN** `Conversation` MUST 支持可选的 `modelSelection` 字段，且其中 MUST 包含 `providerId`、`modelId` 与 `modelOptions`
- **AND** 旧会话在缺失 `modelSelection` 时 MUST 继续可读

### Requirement: Define multimodal model provider interface
系统 MUST 定义统一的 `IModelProvider` 契约，用于描述支持附件输入、模型功能选项输入与标准化流式输出的模型提供者能力。

#### Scenario: Validate sendMessage structure
- **WHEN** 开发者实现一个新的模型提供者
- **THEN** 该实现的 `sendMessage` 接口 MUST 支持接收 `prompt`、`modelId`、`modelOptions`、会话上下文以及附件列表
- **AND** 其返回值 MUST 包含最终 `text`、`conversationId`、`messageId` 以及可选的最终 `annotations`

## ADDED Requirements

### Requirement: Provider model catalogs MUST describe model option metadata
系统 MUST 允许 Provider 模型目录为每个模型声明可用的功能选项元数据，使 UI、store 与 provider 能基于同一份契约理解模型能力，而不是各自维护平行配置。

#### Scenario: Expose model options in provider catalog
- **WHEN** runtime 返回某个 Provider 的模型目录
- **THEN** 每个模型 MAY 携带 `options` 列表
- **AND** 若声明某个 option，则该 option MUST 至少包含稳定的 `key`、用户可见的 `label` 与 `type = 'boolean'`

#### Scenario: Describe conflicts and defaults for model options
- **WHEN** 某个模型功能项与其他功能项不能同时启用，或需要声明默认开关状态
- **THEN** 模型目录 MUST 能表达该 option 的冲突关系与默认值
- **AND** 上层状态管理 MUST 可以仅依赖目录元数据完成冲突裁剪与默认初始化
