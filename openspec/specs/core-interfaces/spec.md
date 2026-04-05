## ADDED Requirements

### Requirement: Core interfaces MUST define an optional agent-capable model provider extension
系统 MUST 在保持 `IModelProvider` 兼容性的前提下，定义可选的 Agent-capable provider 扩展契约，以表达某个模型 provider 具备原生 Agent 执行能力，而不是要求所有 provider 一起升级到新的必选接口。

#### Scenario: Preserve the base model provider contract
- **WHEN** 现有 ChatGPT Web、Desktop Proxy、Extension Proxy 或其他普通模型 provider 未实现 Agent 能力
- **THEN** 它们 MUST 继续仅通过 `IModelProvider` 契约工作
- **AND** 系统 MUST NOT 因 Agent 扩展而要求这些 provider 修改既有 `sendMessage` 签名

#### Scenario: Declare native agent capability on a provider
- **WHEN** 某个 provider 需要暴露原生 Agent 执行入口
- **THEN** 系统 MUST 允许该 provider 通过 `IAgentCapableProvider extends IModelProvider` 或等价契约声明能力
- **AND** 该扩展契约 MUST 至少表达能力声明接口与原生 Agent 执行入口

### Requirement: Core interfaces MUST define agent runtime request contracts using resolved agent config
系统 MUST 为 Agent 运行时定义稳定的请求与结果契约，并直接复用当前已解析的 `ResolvedAgentConfig` 作为运行态 Agent 配置，而不是再引入第二套并行的 Agent 配置模型。

#### Scenario: Send the current resolved agent into runtime
- **WHEN** 上层聊天或知识工作区发起一次 Agent 请求
- **THEN** Agent 运行时请求契约 MUST 允许直接携带当前活动的 `ResolvedAgentConfig`
- **AND** 该契约 MUST 同时包含 prompt、上下文历史、附件、模型选项与会话标识等执行所需信息

#### Scenario: Pass workspace context and resolved tool declarations into runtime and provider
- **WHEN** 知识工作区中的 Agent 请求需要使用作用域文件工具
- **THEN** `AgentRuntimeRequest` MUST 能携带当前 `activePath`、`contextProvider` 与可选的 `activeDocument`
- **AND** `AgentRunRequest` MUST 能携带运行时已解析好的工具声明，而不是只依赖原始 `agent.tools`

#### Scenario: Include the active document only when the provider accepts its MIME type
- **WHEN** 当前知识工作区节点是一个文件且右栏 Agent 发起请求
- **THEN** Agent 运行时请求契约 MUST 允许程序侧根据模型 provider 声明的文档能力决定是否附带该 `activeDocument`
- **AND** 当 provider 未声明接受当前 `mimeType` 时，系统 MUST NOT 把该文档内容作为正文或附件直接注入模型输入

#### Scenario: Expose the final prepared request for history persistence
- **WHEN** Agent 运行时根据 provider 能力、当前文档和历史消息完成一次最终请求组装
- **THEN** 系统 MUST 能让会话管理层拿到本轮最终真实请求的快照，包括最终 prompt、最终 attachments，以及需要持久化的上下文信息
- **AND** 会话管理层 MUST 基于这份快照更新本地历史，而不是仅凭发送前的 UI 状态推断

#### Scenario: Reuse existing stream result contracts
- **WHEN** Agent 运行时或 Agent-capable provider 返回流式更新与最终结果
- **THEN** 系统 MUST 继续复用既有的 `ProviderStreamUpdate` 与 `ProviderSendResult` 契约
- **AND** 第一阶段 MUST NOT 为 Agent 单独定义新的 UI 事件流结果结构

### Requirement: Core interfaces MUST define MIME-aware context document contracts
系统 MUST 为知识工作区定义通用用户文档契约，使 `IContextProvider.readDocument()` / `writeDocument()` 能表达文本与二进制内容，而不是继续把 `ContextDocument` 限定为纯文本 `content: string`。

#### Scenario: Read a document with MIME-aware payload
- **WHEN** 上层工作区请求读取任意一个用户文档
- **THEN** `IContextProvider.readDocument()` MUST 返回至少包含 `path`、`mimeType` 与 `dataBase64` 的 `ContextDocument`
- **AND** 返回结果 MAY 包含 `updatedAt`、`version` 与 `canWrite` 等附加元数据

#### Scenario: Write a document through the same contract
- **WHEN** 上层工作区请求写回一个用户文档
- **THEN** `IContextProvider.writeDocument()` MUST 允许以统一的 `WriteContextDocumentInput` 表达 `path`、`mimeType`、`dataBase64` 与可选版本约束
- **AND** 系统 MUST NOT 为 PDF 或其他二进制文档再额外定义平行的 `readBinaryDocument()` 主路径

#### Scenario: Manage nodes through the same context provider contract
- **WHEN** 上层工作区请求创建、删除或重命名文件树节点
- **THEN** `IContextProvider` MUST 继续通过统一契约暴露 `createNode`、`deleteNode` 与 `renameNode`
- **AND** 系统 MUST NOT 为这些操作引入脱离 `IContextProvider` 的并行文件管理接口

### Requirement: Core interfaces MUST allow model providers to declare accepted document MIME types
系统 MUST 允许 `IModelProvider` 通过可选扩展能力声明当前模型可接受的文档 `mimeType`，使工作区能够在发送请求前判定当前文档是否应进入模型输入。

#### Scenario: Provider declares accepted document MIME types
- **WHEN** 某个模型 provider 支持从工作区直接接收文档正文或附件
- **THEN** 系统 MUST 允许该 provider 暴露类似 `getDocumentCapability()` 的可选能力接口
- **AND** 该能力声明 MUST 至少包含一组可接受的 `mimeType`

#### Scenario: Providers without document capability remain compatible
- **WHEN** 某个模型 provider 未实现文档能力声明
- **THEN** 它 MUST 继续可以仅通过现有 `IModelProvider` 契约工作
- **AND** 工作区 MUST 将其视为“默认不接受额外文档内容注入”

### Requirement: Core interfaces MUST expose conversation persistence through a dedicated persist contract
系统 MUST 使用专门表达“会话持久化”的核心契约来承载会话 CRUD 能力，而不是继续同时暴露 `IStorageProvider` 与 `IConversationStorageProvider` 两套等价命名。该主契约 MUST 命名为 `IConversationPersistProvider`，并保持现有会话保存、读取、列表和删除语义不变。

#### Scenario: Expose one canonical conversation persistence interface
- **WHEN** 核心模块导出会话持久化相关接口
- **THEN** 系统 MUST 提供 `IConversationPersistProvider`
- **AND** 该接口 MUST 至少包含 `saveConversation`、`getConversation`、`getAllConversations` 与 `deleteConversation`

#### Scenario: Preserve compatibility for current conversation data model
- **WHEN** 调用方继续使用现有 `Conversation`、`ConversationMessage`、`MessageAttachment` 等会话数据结构
- **THEN** 系统 MUST 保持这些数据模型的字段语义不变
- **AND** 本次重构 MUST NOT 借接口重命名顺带改变会话内容结构

### Requirement: Core interfaces MUST name external conversation sources explicitly
系统 MUST 以 `IExternalConversationProvider` 作为外部会话来源的统一契约，并通过相应的外部 provider 标识与摘要类型表达其“来源于外部系统”的语义，而不是继续使用泛化的 `IHistoryProvider` 名称。

#### Scenario: Expose external source contract under explicit naming
- **WHEN** 核心模块导出外部会话来源相关接口
- **THEN** 系统 MUST 提供 `IExternalConversationProvider`
- **AND** 相关 provider entry 类型 MUST 引用该新接口，而不是继续把“历史”作为主语义

#### Scenario: Keep external conversation read behavior stable during rename
- **WHEN** 外部会话来源实现迁移到新接口命名
- **THEN** 系统 MUST 继续支持外部会话摘要列表读取和详情读取
- **AND** 本次重构阶段 MUST NOT 改变这些读取操作的行为约束

### Requirement: Core interfaces MUST distinguish model runtime from other provider families
系统 MUST 将模型 provider 装配接口明确命名为 `ModelProviderRuntime`，以表达其职责仅限于模型 provider 的过滤、目录读取与实例创建，而不是广义的 provider 管理总线。

#### Scenario: Expose a model-scoped runtime contract
- **WHEN** 核心运行时模块导出 provider runtime 类型
- **THEN** 系统 MUST 以 `ModelProviderRuntime` 作为模型运行时契约名
- **AND** 该契约 MUST 继续承载 provider 列表、provider catalog、模型目录与 provider 实例获取能力

#### Scenario: Keep runtime method semantics stable during rename
- **WHEN** 现有 Compare、Agent 或宿主装配逻辑使用模型运行时
- **THEN** 系统 MUST 保持 `getAvailableProviders`、`getProviderCatalog`、`getProviderModels` 与 `getProvider` 的行为语义不变
- **AND** 本次重构 MUST NOT 顺带把其他 provider 家族注入到该 runtime 契约中
