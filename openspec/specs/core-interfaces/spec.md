English | [Chinese](spec.zh-CN.md)

## Purpose
Define the shared core contracts for providers, conversations, agent runtime requests, workspace context, persistence, and related cross-host data models.
## Requirements
### Requirement: Core interfaces MUST define an optional provider capability for conversation title generation
The core model-provider contract MUST allow providers to expose an optional conversation-title generation capability that is separate from normal message sending. Providers that do not implement this capability MUST remain compatible with the base `IModelProvider` contract.

#### Scenario: Expose optional title generation without changing basic send semantics
- **WHEN** the core module exports model-provider interfaces
- **THEN** the system MUST allow `IModelProvider` to expose an optional `generateConversationTitle(...)` capability
- **AND** providers that do not implement that capability MUST continue to work through the existing message-sending contract

#### Scenario: Keep title generation independent from active reasoning settings
- **WHEN** a caller requests provider-side conversation title generation
- **THEN** the shared title-generation options MUST remain independent from normal `reasoningEffort` and model option settings
- **AND** the caller MUST NOT be required to pass active chat reasoning configuration into the title-generation path

### Requirement: Core interfaces MUST define an optional agent-capable model provider extension
The system MUST 在keep `IModelProvider` compatible性的前提下，定义可选的 Agent-capable provider 扩展契约，以表达某个model provider 具备原生 Agent 执行capability，而不是要求所有 provider 一起升级到新的必选interface。

#### Scenario: Preserve the base model provider contract
- **WHEN** 现有 ChatGPT Web、Desktop Proxy、Extension Proxy 或其他普通model provider 未实现 Agent capability
- **THEN** 它们 MUST continueonly通过 `IModelProvider` 契约工作
- **AND** The system MUST NOT 因 Agent 扩展而要求这些 provider 修改既有 `sendMessage` 签名

#### Scenario: Declare native agent capability on a provider
- **WHEN** 某个 provider 需要expose原生 Agent 执行入口
- **THEN** The system MUST allow该 provider 通过 `IAgentCapableProvider extends IModelProvider` 或等价契约声明capability
- **AND** 该扩展契约 MUST 至少表达capability声明interface与原生 Agent 执行入口

### Requirement: Core interfaces MUST define agent runtime request contracts using resolved agent config
The system MUST 为 Agent 运行时定义稳定的请求与result契约，并直接复用current已resolve的 `ResolvedAgentConfig` 作为运行态 Agent configuration，而不是再引入第二套并行的 Agent configurationmodel。

#### Scenario: Send the current resolved agent into runtime
- **WHEN** 上层聊天或knowledge workspace发起一次 Agent 请求
- **THEN** Agent 运行时请求契约 MUST allow直接携带current活动的 `ResolvedAgentConfig`
- **AND** 该契约 MUST 同时包含 prompt、上下文history、attachment、model选项与conversation标识等执行所需信息

#### Scenario: Pass workspace context and resolved tool declarations into runtime and provider
- **WHEN** knowledge workspace中的 Agent 请求需要使用scope文件tool
- **THEN** `AgentRuntimeRequest` MUST 能携带current `activePath`、`contextProvider` 与可选的 `activeDocument`
- **AND** `AgentRunRequest` MUST 能携带运行时已resolve好的tool声明，而不是只依赖原始 `agent.tools`

#### Scenario: Include the active document only when the provider accepts its MIME type
- **WHEN** currentknowledge workspace节点是一个文件且右栏 Agent 发起请求
- **THEN** Agent 运行时请求契约 MUST allow程序侧根据model provider 声明的documentcapability决定是否附带该 `activeDocument`
- **AND** 当 provider 未声明接受current `mimeType` 时，The system MUST NOT 把该document内容作为body或attachment直接注入modelinput

#### Scenario: Expose the final prepared request for history persistence
- **WHEN** Agent 运行时根据 provider capability、currentdocument和historymessage完成一次最终请求组装
- **THEN** The system MUST 能让conversation管理层拿到本轮最终真实请求的快照，包括最终 prompt、最终 attachments，以及需要持久化的上下文信息
- **AND** conversation管理层 MUST 基于这份快照updatelocalhistory，而不是only凭发送前的 UI 状态推断

#### Scenario: Reuse existing stream result contracts
- **WHEN** Agent 运行时或 Agent-capable provider return流式update与最终result
- **THEN** The system MUST continue复用既有的 `ProviderStreamUpdate` 与 `ProviderSendResult` 契约
- **AND** 第一阶段 MUST NOT 为 Agent 单独定义新的 UI 事件流result结构

### Requirement: Core interfaces MUST carry reasoning effort through model provider requests
The system MUST allow `IModelProvider` 请求显式携带思考推理程度，并让 conversation/model selection 持久化该值，默认值 MUST 为 `high`。该能力用于把 UI、conversation state、Agent runtime 与 provider 请求链路上的推理强度保持一致。

#### Scenario: Send reasoning effort with model provider requests
- **WHEN** 上层调用 `sendMessage` 或 Agent runtime 发起一次模型请求
- **THEN** `SendMessageOptions` MUST allow携带 `reasoningEffort`
- **AND** `reasoningEffort` MUST support `low`、`medium` 与 `high`

#### Scenario: Persist reasoning effort with conversation model selection
- **WHEN** conversation 保存或恢复当前模型选择
- **THEN** `ConversationModelSelection` MUST carry `reasoningEffort`
- **AND** 当历史数据未显式提供该值时，系统 MUST default to `high`

#### Scenario: Preserve reasoning effort through runtime and archive flows
- **WHEN** Agent runtime、conversation archive 或 provider proxy 转发一次模型请求
- **THEN** 这些中间层 MUST 继续透传 `reasoningEffort`
- **AND** 中间层 MUST NOT 擅自把该值降级、清空或映射成布尔开关

### Requirement: Core interfaces MUST define MIME-aware context document contracts
The system MUST 为knowledge workspace定义通用the userdocument契约，使 `IContextProvider.readDocument()` / `writeDocument()` 能表达text与二进制内容，而不是continue把 `ContextDocument` 限定为纯text `content: string`。

#### Scenario: Read a document with MIME-aware payload
- **WHEN** 上层工作区请求read任意一个the userdocument
- **THEN** `IContextProvider.readDocument()` MUST return至少包含 `path`、`mimeType` 与 `dataBase64` 的 `ContextDocument`
- **AND** returnresult MAY 包含 `updatedAt`、`version` 与 `canWrite` 等附加元数据

#### Scenario: Write a document through the same contract
- **WHEN** 上层工作区请求write back一个the userdocument
- **THEN** `IContextProvider.writeDocument()` MUST allow以统一的 `WriteContextDocumentInput` 表达 `path`、`mimeType`、`dataBase64` 与可选版本约束
- **AND** The system MUST NOT 为 PDF 或其他二进制document再额外定义平行的 `readBinaryDocument()` 主路径

#### Scenario: Manage nodes through the same context provider contract
- **WHEN** 上层工作区请求create、delete或renamefile tree节点
- **THEN** `IContextProvider` MUST continue通过统一契约expose `createNode`、`deleteNode` 与 `renameNode`
- **AND** The system MUST NOT 为这些操作引入脱离 `IContextProvider` 的并行文件管理interface

### Requirement: Core interfaces MUST allow model providers to declare accepted document MIME types
The system MUST allow `IModelProvider` 通过可选扩展capability声明currentmodel可接受的document `mimeType`，使工作区能够在发送请求前判定currentdocument是否应entermodelinput。

#### Scenario: Provider declares accepted document MIME types
- **WHEN** 某个model provider support从工作区直接接收documentbody或attachment
- **THEN** The system MUST allow该 provider expose类似 `getDocumentCapability()` 的可选capabilityinterface
- **AND** 该capability声明 MUST 至少包含一组可接受的 `mimeType`

#### Scenario: Providers without document capability remain compatible
- **WHEN** 某个model provider 未实现documentcapability声明
- **THEN** 它 MUST continue可以only通过现有 `IModelProvider` 契约工作
- **AND** 工作区 MUST 将其视为“default不接受额外document内容注入”

### Requirement: Core interfaces MUST expose conversation persistence through a dedicated persist contract
The system MUST 使用专门表达“conversation持久化”的核心契约来承载conversation CRUD capability，而不是continue同时expose `IStorageProvider` 与 `IConversationStorageProvider` 两套等价命名。该主契约 MUST 命名为 `IConversationPersistProvider`，并keep现有conversationsave、read、list和delete语义不变。

#### Scenario: Expose one canonical conversation persistence interface
- **WHEN** 核心模块导出conversation持久化相关interface
- **THEN** The system MUST provide `IConversationPersistProvider`
- **AND** 该interface MUST 至少包含 `saveConversation`、`getConversation`、`getAllConversations` 与 `deleteConversation`

#### Scenario: Preserve compatibility for current conversation data model
- **WHEN** 调用方continue使用现有 `Conversation`、`ConversationMessage`、`MessageAttachment` 等conversation数据结构
- **THEN** The system MUST keep这些数据model的字段语义不变
- **AND** 本次重构 MUST NOT 借interfacerename顺带改变conversation内容结构

### Requirement: Core interfaces MUST name external conversation sources explicitly
The system MUST 以 `IExternalConversationProvider` 作为外部conversation来源的统一契约，并通过相应的外部 provider 标识与summary类型表达其“来源于外部系统”的语义，而不是continue使用泛化的 `IHistoryProvider` 名称。

#### Scenario: Expose external source contract under explicit naming
- **WHEN** 核心模块导出外部conversation来源相关interface
- **THEN** The system MUST provide `IExternalConversationProvider`
- **AND** 相关 provider entry 类型 MUST 引用该新interface，而不是continue把“history”作为主语义

#### Scenario: Keep external conversation read behavior stable during rename
- **WHEN** 外部conversation来源实现迁移到新interface命名
- **THEN** The system MUST continuesupport外部conversationsummarylistread和detailsread
- **AND** 本次重构阶段 MUST NOT 改变这些read操作的行为约束

### Requirement: Core interfaces MUST distinguish model runtime from other provider families
The system MUST 将model provider 装配interface明确命名为 `ModelProviderRuntime`，以表达其职责only限于model provider 的filter、directoryread与实例create，而不是广义的 provider 管理总线。

#### Scenario: Expose a model-scoped runtime contract
- **WHEN** 核心运行时模块导出 provider runtime 类型
- **THEN** The system MUST 以 `ModelProviderRuntime` 作为model运行时契约名
- **AND** 该契约 MUST continue承载 provider list、provider catalog、modeldirectory与 provider 实例获取capability

#### Scenario: Keep runtime method semantics stable during rename
- **WHEN** 现有 Compare、Agent 或host装配逻辑使用model运行时
- **THEN** The system MUST keep `getAvailableProviders`、`getProviderCatalog`、`getProviderModels` 与 `getProvider` 的行为语义不变
- **AND** 本次重构 MUST NOT 顺带把其他 provider 家族注入到该 runtime 契约中

### Requirement: Core interfaces MUST define workspace context contracts for knowledge workspaces
The system MUST 为knowledge workspace定义统一的 `WorkspaceContext` 契约，并要求 `IContextProvider` 通过 `getContext()` return该契约，而不是continue依赖逐层directory枚举与路径级 Agent resolve。`WorkspaceContext` MUST 同时provide完整directory树与 `agentConfigs` cache，使 UI 能够直接通过 `agentKey` 获取current生效 Agent。

#### Scenario: Return workspace context from the context provider
- **WHEN** 上层knowledge workspace请求上下文数据
- **THEN** `IContextProvider` MUST provide `getContext(): Promise<WorkspaceContext>`
- **AND** returnresult MUST 至少包含 `nodes` 与 `agentConfigs`

#### Scenario: Reference agent configs by agent key
- **WHEN** 某个节点声明了自己的 `agentKey`
- **THEN** `WorkspaceContext.agentConfigs` MUST 包含与该 key 对应的完整 `ResolvedAgentConfig`
- **AND** 上层 UI MUST 能only通过 `agentKey + agentConfigs` 获取current Agent，而不再依赖路径级resolve

### Requirement: Core interfaces MUST define hierarchical context nodes with agent metadata
The system MUST 将knowledge workspace节点定义为层级结构，而不是onlysupport按父路径分页式枚举。`ContextNode` MUST support `children`、`isAgentOwner` 与 `agentKey`，其中 `isAgentOwner` 表示directory是否直接拥有 `.agent.json`，`agentKey` 表示该节点current生效的 Agent。

#### Scenario: Represent the full tree through nested children
- **WHEN** `IContextProvider.getContext()` returndirectory树
- **THEN** `ContextNode` MUST 能通过 `children` 表达完整subtree结构
- **AND** 上层 MUST 可以only基于这棵树完成directory遍历与节点查找

#### Scenario: Represent owner and effective agent separately
- **WHEN** `ContextNode` 表达一个directory节点
- **THEN** 该节点 MUST 能独立表达 `isAgentOwner` 与 `agentKey`
- **AND** The system MUST NOT 把“directory直接拥有 Agent”与“节点current生效 Agent”混为the same个字段

### Requirement: Agent configs MUST automatically inherit from system fallback via merge
The system MUST 去除 `.agent.json` 中复杂的 `override` 和 `merge` 声明属性，所有的 Agent configuration MUST 隐式使用 `merge` 逻辑进行自顶向下的merge。同时，系统的global兜底configuration（Fallback）MUST 作为merge链路的最底层基底（Base），从而使得即使是最深层的子directory也能天然继承到基础的toolcapability和指令。

#### Scenario: Subfolder config without explicit tools
- **WHEN** 子directory的 `.agent.json` 只定义了 `modelName` 而没有定义 `tools`
- **THEN** `resolveScopedAgentConfig` MUST 将系统的 fallback `tools` 完好地merge进来
- **AND** 该子directory的 Agent 应当同时具备自定义的model名称和globaldefault的toollist

#### Scenario: No override keyword needed
- **WHEN** the user希望完全修改上级设置
- **THEN** the user只需在 `.agent.json` 中explicitprovide自身的属性（例如重新provide空toollist或全套属性）
- **AND** 系统不再需要通过特殊的 `inheritance: 'override'` 语法来截断继承链

### Requirement: Core interfaces MUST define conversation query lookup on the context provider
The system MUST allow `IContextProvider` provide统一的conversation只读queryinterface，并support通过 `documentPath` 条件read关联conversationlist，使knowledge workspace右栏 assistant pane 能在不依赖具体host存储实现的前提下readdocument相关对话。

#### Scenario: Expose document conversation lookup on IContextProvider
- **WHEN** 核心模块导出knowledge workspace context 契约
- **THEN** `IContextProvider` MUST provide `getConversations(query: ConversationQuery): Promise<Conversation[]>`
- **AND** 调用方 MUST 可以通过 `getConversations({ documentPath })` querydocument关联conversation
- **AND** 该interface MUST 与现有 `getContext`、`readDocument`、`writeDocument` 等capability处于the same契约中

#### Scenario: Preserve compatibility for callers that do not use document conversations
- **WHEN** 某些上层调用方只依赖directory树与document读写capability
- **THEN** 它们 MUST continue可以only按现有方式消费 `IContextProvider`
- **AND** 新增的conversationquerycapability MUST 不改变现有方法的inputoutput语义

### Requirement: Core conversation model MUST preserve document association metadata
The system MUST allow `Conversation` 以可选字段表达其关联的一个或多个工作区document路径，使right-side assistant pane、持久化与sync链路可以围绕the same份conversation级元数据工作。

#### Scenario: Carry multiple associated document paths on a conversation
- **WHEN** 某条conversation同时关联多个工作区document
- **THEN** `Conversation` MUST 能以 `documentPaths` 表达这些路径
- **AND** 该字段 MUST allow缺省，以compatible旧conversation

#### Scenario: Preserve compatibility for conversations without document associations
- **WHEN** 调用方read一条旧conversation且该conversation未包含 `documentPaths`
- **THEN** The system MUST allow该字段缺省
- **AND** 旧conversation MUST continue可以被正常read和使用

### Requirement: Core conversation model MUST preserve structured functional message parts
The core conversation model MUST allow assistant messages to carry optional structured functional parts for tool calls, function calls, search traces, and related operational details. Conversations without these parts MUST remain valid.

#### Scenario: Store functional parts on a conversation message
- **WHEN** a provider or runtime returns structured functional details for an assistant message
- **THEN** the system MUST allow the message to persist those details as `functionalParts`
- **AND** the message MUST continue to preserve its normal text content and annotations

#### Scenario: Load conversations without functional parts
- **WHEN** the system normalizes an older conversation message that has no `functionalParts`
- **THEN** the system MUST treat the field as absent
- **AND** the conversation MUST remain readable and renderable

### Requirement: Provider result contracts MUST carry optional functional message parts
The provider stream and final result contracts MUST support optional functional message parts so normal providers, Agent-capable providers, and proxy providers can share one output shape.

#### Scenario: Stream functional parts during generation
- **WHEN** a provider has structured functional details during a streaming response
- **THEN** the provider stream update MAY include `functionalParts`
- **AND** consumers MUST be able to associate those parts with the active assistant message

#### Scenario: Return functional parts in final result
- **WHEN** a provider completes a response with structured functional details
- **THEN** the final provider result MUST be able to include `functionalParts`
- **AND** the field MUST be optional for providers that do not expose such details

### Requirement: Core interfaces MUST define a first-class task provider contract
The system MUST define a shared `Task` model that is independent from the `Conversation` model, and MUST expose task-domain operations through `IContextProvider.getTaskProvider()` rather than flattening task CRUD methods directly into the general context-provider contract. The shared task contract MUST support task querying, creation, update, deletion, explicit completion transitions, and provider-managed calendar synchronization state, and a persisted mutually exclusive execution-state field.

#### Scenario: Represent a document-scoped task
- **WHEN** the system creates or returns a task associated with a document
- **THEN** the task MUST carry that document path in `documentPath`
- **AND** the task MUST still remain a `Task` object rather than being embedded in a conversation model

#### Scenario: Represent a project-scoped task
- **WHEN** the system creates or returns a task associated directly with a project/agent scope
- **THEN** the task MUST carry that scope in `agentKey`
- **AND** the task MUST NOT be required to carry a document path at the same time

#### Scenario: Represent a task that belongs to both document and project scopes
- **WHEN** the system creates or returns a task associated with both a document and a project/agent scope
- **THEN** the task MUST be allowed to carry both `documentPath` and `agentKey`
- **AND** callers MUST NOT be forced to choose only one of those scope fields

#### Scenario: Represent calendar synchronization state on a task
- **WHEN** the system creates or returns a task that can participate in calendar synchronization
- **THEN** the task MUST carry calendar synchronization state as part of the shared `Task` object
- **AND** callers MUST NOT need a second mapping object to locate the external event or sync status

#### Scenario: Represent execution state on a task
- **WHEN** the system creates or returns a task that participates in daily execution-state ordering or display
- **THEN** the task MUST carry its execution-state value as part of the shared `Task` object
- **AND** callers MUST NOT need a second mapping object to discover whether the task is `doing`, `morning`, `afternoon`, or `evening`

#### Scenario: Resolve task operations from the context provider
- **WHEN** workspace UI code needs task operations for the current scope
- **THEN** it MUST obtain them through `IContextProvider.getTaskProvider()`
- **AND** the returned object MUST implement the shared `ITaskProvider` contract

#### Scenario: Keep document and conversation contracts separate from task mutations
- **WHEN** the task contract is added to the workspace context architecture
- **THEN** existing `readDocument`, `writeDocument`, and `getConversations` contracts MUST remain available as separate behaviors
- **AND** task mutation operations MUST NOT be added directly to those non-task contracts

#### Scenario: Complete a task through a dedicated completion API
- **WHEN** caller code needs to mark a task complete or reopen it
- **THEN** it MUST call `setTaskCompleted(taskId, completed)`
- **AND** the contract MUST NOT require callers to simulate completion changes exclusively through generic update semantics

#### Scenario: Query tasks by one active scope
- **WHEN** caller code requests `getTasks(documentPath, agentKey, completed)`
- **THEN** the contract MUST support resolving document-scoped tasks, project-scoped tasks, or tasks that belong to both scopes for the active selection
- **AND** callers MUST NOT be forced to use a separate query-object type

#### Scenario: Resolve today-tag task queries with overdue unfinished tasks
- **WHEN** caller code requests `getTasks(documentPath, agentKey, completed, 'today')`
- **THEN** the contract MUST be allowed to return unfinished tasks due earlier today and unfinished overdue tasks from prior dates
- **AND** it MUST NOT require callers to issue a second overdue-specific query

#### Scenario: Normalize system-managed fields during create
- **WHEN** caller code creates a task and omits or provides provisional values for `id`, `createdAt`, `updatedAt`, or `completedAt`
- **THEN** the provider MAY replace those values with normalized provider-managed values
- **AND** the returned task MUST contain the normalized values

#### Scenario: Normalize system-managed fields during update
- **WHEN** caller code updates a task through `updateTask(task)`
- **THEN** the provider MAY recalculate `updatedAt` or `completedAt` according to its persistence rules
- **AND** the returned task MUST reflect the normalized persisted state

#### Scenario: Coordinate timed-task calendar synchronization during create or update
- **WHEN** a provider creates or updates a task that qualifies for calendar synchronization
- **THEN** the provider MAY invoke an internal calendar-sync service during the same task lifecycle
- **AND** the resulting task MUST return updated calendar synchronization state through the same `Task` object

#### Scenario: Synchronize date-only tasks with a default calendar time
- **WHEN** a provider creates or updates a task whose `dueAt` carries only a date-level value
- **THEN** the provider MUST still be allowed to synchronize that task through the calendar-sync service
- **AND** the provider MAY normalize the external calendar event time to a deterministic default such as 09:00 local time

#### Scenario: Preserve task mutations when external sync fails
- **WHEN** a provider-managed calendar synchronization attempt fails during task create or update
- **THEN** the task mutation MUST still be allowed to succeed
- **AND** the returned task MUST contain failure state that reflects the unsuccessful sync attempt

### Requirement: Core interfaces MUST extend IContextProvider with document ID resolution methods
`IContextProvider` MUST expose two new methods: `resolveDocumentIds` for batch ID-to-node resolution and `getDocumentId` for path-to-ID lookup. These methods MUST be part of the base interface so all provider implementations (FileSystem, HTTP, mock) are required to implement them.

#### Scenario: Batch-resolve document IDs to context nodes
- **WHEN** a caller invokes `resolveDocumentIds(ids: string[])` on a context provider
- **THEN** the provider MUST return a `Map<string, ContextNode | null>` covering every requested ID
- **AND** IDs that map to existing documents MUST resolve to their current `ContextNode`
- **AND** IDs for deleted or unknown documents MUST map to `null`

#### Scenario: Resolve a document path to its stable ID
- **WHEN** a caller invokes `getDocumentId(path: string)` on a context provider
- **AND** the document at that path has a `jarvis_id` in its frontmatter
- **THEN** the provider MUST return that `jarvis_id` string
- **AND** if the document has no ID yet, the provider MUST assign one and return it

---

### Requirement: Core interfaces MUST add documentIds to Conversation and Task models
The `Conversation` type MUST add a `documentIds?: string[]` field as the stable-ID counterpart to the existing `documentPaths`. The `Task` type MUST add a `documentId?: string | null` field alongside the existing `documentPath`. Both legacy path fields MUST be retained as deprecated for backward compatibility during the migration window.

#### Scenario: Conversation stores document associations by stable ID
- **WHEN** a conversation is linked to one or more documents
- **THEN** the `Conversation` object MUST carry the association in `documentIds`
- **AND** each entry in `documentIds` MUST be a valid `jarvis_id` of a `.md` document

#### Scenario: Task stores document association by stable ID
- **WHEN** a task is created or updated with a document association
- **THEN** the `Task` object MUST carry the association in `documentId`
- **AND** `documentId` MUST be the `jarvis_id` of the associated `.md` document, or `null` for project-level tasks

#### Scenario: Deprecated path fields remain readable during migration
- **WHEN** a conversation or task record was created before the ID migration
- **AND** only `documentPaths` / `documentPath` is populated
- **THEN** the system MUST continue to read and display the path-based association
- **AND** the system MUST migrate the record to `documentIds` / `documentId` on first access

### Requirement: ProviderStreamUpdate and ProviderSendResult MUST carry optional group structured fields
`ProviderStreamUpdate` and `ProviderSendResult` SHALL each carry optional `groupMembers` and `groupSummary` fields. These fields are only populated by `MultiModelGroupProvider`; all other providers MUST remain unaffected.

#### Scenario: Group provider emits groupMembers in stream updates
- **WHEN** `MultiModelGroupProvider.sendMessage` emits `onUpdate` during a group turn
- **THEN** the update object MAY include `groupMembers: GroupMemberPart[]` and optionally `groupSummary: GroupSummaryPart`
- **AND** the `text` field MUST still carry the flattened plaintext fallback

#### Scenario: Non-group providers are unaffected
- **WHEN** any provider other than `MultiModelGroupProvider` emits `onUpdate`
- **THEN** `groupMembers` and `groupSummary` MUST be absent from the update object
- **AND** existing consumers of `ProviderStreamUpdate` MUST continue to work without modification

### Requirement: ConversationMessage MUST carry optional group structured fields
`ConversationMessage` SHALL gain optional `groupMembers?: GroupMemberPart[]` and `groupSummary?: GroupSummaryPart` fields. The existing `content` field MUST be retained as a flattened plaintext fallback for search, export, and legacy rendering.

#### Scenario: Group turn message stores structured fields alongside content
- **WHEN** the chat store processes a group turn result
- **THEN** `lastMsg.groupMembers` and `lastMsg.groupSummary` MUST be written from the provider result
- **AND** `lastMsg.content` MUST still contain the flattened Markdown text

#### Scenario: Messages without group fields render via existing path
- **WHEN** a `ConversationMessage` has no `groupMembers` field
- **THEN** the rendering system MUST use the existing `MarkdownContent` path for that message
- **AND** no runtime errors SHALL occur due to the absent field

