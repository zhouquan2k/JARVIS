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

### Requirement: Define IStorageProvider Interface
系统 MUST 将现有 conversation-oriented 的存储契约收敛为 `IConversationStorageProvider` 作为规范名称，用于表示聊天会话持久化接口；同时系统 MAY 继续暴露 `IStorageProvider` 作为兼容别名，以便现有调用方平滑迁移。该接口 MUST 继续为 `Conversation` 提供标准的数据存取操作，并保证实现可以无损保存与读取包含来源元数据、同步元数据、结构化消息内容以及问题索引元数据的会话数据。

#### Scenario: Validate canonical conversation storage provider structure
- **WHEN** 开发者实现新的聊天会话存储提供者
- **THEN** 系统 MUST 以 `IConversationStorageProvider` 作为该契约的规范名称
- **AND** 该实现 MUST 包含 `id`、`saveConversation`、`getConversation`、`getAllConversations` 和 `deleteConversation` 这四个核心方法

#### Scenario: Preserve compatibility for existing storage provider references
- **WHEN** 现有模块仍通过 `IStorageProvider` 引用聊天会话存储契约
- **THEN** 系统 MAY 继续提供兼容别名以维持迁移期间的可用性
- **AND** 该别名所表示的能力边界 MUST 与 `IConversationStorageProvider` 保持一致

### Requirement: External history contracts MUST identify provider origin consistently
系统 MUST 通过统一的 provider 标识体系描述外部历史来源，使 UI 状态、摘要数据与持久化会话都能复用同一组 provider ID。

#### Scenario: Use provider ID as shared origin token
- **WHEN** 外部历史 provider 返回摘要或详情数据
- **THEN** 系统 MUST 使用 `chatgpt-web`、`gemini-web` 或 `external-file` 这一类统一 provider ID 表示来源
- **AND** UI 工作台状态与 `Conversation.origin` MUST 能直接消费这些 provider ID 而不需要额外映射一套平行命名

## ADDED Requirements

### Requirement: Define multimodal model provider interface
系统 MUST 定义统一的 `IModelProvider` 契约，用于描述支持附件输入、模型功能选项输入与标准化流式输出的模型提供者能力。

#### Scenario: Validate sendMessage structure
- **WHEN** 开发者实现一个新的模型提供者
- **THEN** 该实现的 `sendMessage` 接口 MUST 支持接收 `prompt`、`modelId`、`modelOptions`、会话上下文以及附件列表
- **AND** 其返回值 MUST 包含最终 `text`、`conversationId`、`messageId` 以及可选的最终 `annotations`

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

### Requirement: Define IContextProvider Interface
系统 MUST 定义独立的 `IContextProvider` 接口契约，用于描述知识工作区在本阶段所需的 context 访问能力。该契约 MUST 覆盖权限初始化、目录树读取、文档读取、文档写入和节点创建，而 MUST NOT 将聊天会话存储职责混入其中，也 MUST NOT 把本地文件根目录、数据库连接或其他后端实现细节直接塞进通用接口。

#### Scenario: Validate context provider structure
- **WHEN** 开发者实现新的知识文件 Provider
- **THEN** 该实现 MUST 包含 `id`、`initializeAccess`、`listTree`、`readDocument`、`writeDocument` 和 `createNode`
- **AND** 这些方法 MUST 足以支撑知识工作区的左侧文件浏览与中间所见即所得 Markdown 编辑能力

#### Scenario: Keep backend-specific configuration outside the shared interface
- **WHEN** 某个具体实现需要使用 `CHATPRISM_KNOWLEDGE_ROOT` 或数据库映射等后端配置
- **THEN** 这些配置 MUST 由具体 Provider、工厂或服务端装配层处理
- **AND** 通用 `IContextProvider` 契约 MUST 继续保持跨宿主最小能力边界

### Requirement: Core interfaces MUST define standardized agent binding types
系统 MUST 在共享核心接口层定义标准化的 Agent 配置与解析结果类型，以表达目录作用域 Agent 的名称、职责、核心指令、目标模型 Provider、目标模型名称、工具、技能、继承策略和最终生效结果。

#### Scenario: Express scoped agent configuration in shared types
- **WHEN** 共享层需要描述某个目录中的 `.agent.json`
- **THEN** 系统 MUST 提供 `AgentConfig` 或等价类型来表达 `name`、`instructions`、`modelProviderName`、`modelName`、`tools`、`skills` 与 `inheritance`
- **AND** 这些类型 MUST 可被 Web、Desktop 和 Extension 的共享逻辑直接复用

### Requirement: Core interfaces MUST define a resolved agent contract for runtime consumption
系统 MUST 定义标准化的已解析 Agent 结构，使解析器与聊天运行时之间可以通过稳定契约传递作用域路径、配置来源和最终指令文本，而不是依赖宿主私有对象。

#### Scenario: Describe the effective agent after scope resolution
- **WHEN** provider 完成最近父级查找、`override` 截断与默认兜底
- **THEN** 系统 MUST 提供 `ResolvedAgentConfig` 或等价契约来表达最终生效的 Agent
- **AND** 该契约 MUST 包含 `scopePath`、`sourcePaths`、模型信息和最终指令内容

### Requirement: IContextProvider MUST own scoped agent resolution
系统 MUST 通过 `IContextProvider` 或等价 provider contract 暴露“按节点解析生效 Agent”的统一能力，而不是要求 UI 或独立调用方自行读取 `.agent.json` 并回溯父级目录。

#### Scenario: Resolve the effective scoped agent through the provider
- **WHEN** 上层传入一个当前选中的文件或目录节点路径
- **THEN** `IContextProvider` MUST 直接返回该节点对应的 `ResolvedAgentConfig`
- **AND** 该结果 MUST 已经包含默认兜底、作用域路径与配置来源信息
