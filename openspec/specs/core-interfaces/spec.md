English | [Chinese](spec.zh-CN.md) ## ADDED Requirements ### Requirement: Core interfaces MUST define an optional agent-capable model provider extension
The system MUST 在keep `IModelProvider` compatible性的前提下，定义可选的 Agent-capable provider 扩展契约，以表达某个model provider 具备原生 Agent 执行capability，而不是要求所有 provider 一起升级到新的必选interface。 #### Scenario: Preserve the base model provider contract
- **WHEN** 现有 ChatGPT Web、Desktop Proxy、Extension Proxy 或其他普通model provider 未实现 Agent capability
- **THEN** 它们 MUST continueonly通过 `IModelProvider` 契约工作
- **AND** The system MUST NOT 因 Agent 扩展而要求这些 provider 修改既有 `sendMessage` 签名 #### Scenario: Declare native agent capability on a provider
- **WHEN** 某个 provider 需要expose原生 Agent 执行入口
- **THEN** The system MUST allow该 provider 通过 `IAgentCapableProvider extends IModelProvider` 或等价契约声明capability
- **AND** 该扩展契约 MUST 至少表达capability声明interface与原生 Agent 执行入口 ### Requirement: Core interfaces MUST define agent runtime request contracts using resolved agent config
The system MUST 为 Agent 运行时定义稳定的请求与result契约，并直接复用current已resolve的 `ResolvedAgentConfig` 作为运行态 Agent configuration，而不是再引入第二套并行的 Agent configurationmodel。 #### Scenario: Send the current resolved agent into runtime
- **WHEN** 上层聊天或knowledge workspace发起一次 Agent 请求
- **THEN** Agent 运行时请求契约 MUST allow直接携带current活动的 `ResolvedAgentConfig`
- **AND** 该契约 MUST 同时包含 prompt、上下文history、attachment、model选项与conversation标识等执行所需信息 #### Scenario: Pass workspace context and resolved tool declarations into runtime and provider
- **WHEN** knowledge workspace中的 Agent 请求需要使用scope文件tool
- **THEN** `AgentRuntimeRequest` MUST 能携带current `activePath`、`contextProvider` 与可选的 `activeDocument`
- **AND** `AgentRunRequest` MUST 能携带运行时已resolve好的tool声明，而不是只依赖原始 `agent.tools` #### Scenario: Include the active document only when the provider accepts its MIME type
- **WHEN** currentknowledge workspace节点是一个文件且右栏 Agent 发起请求
- **THEN** Agent 运行时请求契约 MUST allow程序侧根据model provider 声明的documentcapability决定是否附带该 `activeDocument`
- **AND** 当 provider 未声明接受current `mimeType` 时，The system MUST NOT 把该document内容作为body或attachment直接注入modelinput #### Scenario: Expose the final prepared request for history persistence
- **WHEN** Agent 运行时根据 provider capability、currentdocument和historymessage完成一次最终请求组装
- **THEN** The system MUST 能让conversation管理层拿到本轮最终真实请求的快照，包括最终 prompt、最终 attachments，以及需要持久化的上下文信息
- **AND** conversation管理层 MUST 基于这份快照updatelocalhistory，而不是only凭发送前的 UI 状态推断 #### Scenario: Reuse existing stream result contracts
- **WHEN** Agent 运行时或 Agent-capable provider return流式update与最终result
- **THEN** The system MUST continue复用既有的 `ProviderStreamUpdate` 与 `ProviderSendResult` 契约
- **AND** 第一阶段 MUST NOT 为 Agent 单独定义新的 UI 事件流result结构 ### Requirement: Core interfaces MUST define MIME-aware context document contracts
The system MUST 为knowledge workspace定义通用the userdocument契约，使 `IContextProvider.readDocument()` / `writeDocument()` 能表达text与二进制内容，而不是continue把 `ContextDocument` 限定为纯text `content: string`。 #### Scenario: Read a document with MIME-aware payload
- **WHEN** 上层工作区请求read任意一个the userdocument
- **THEN** `IContextProvider.readDocument()` MUST return至少包含 `path`、`mimeType` 与 `dataBase64` 的 `ContextDocument`
- **AND** returnresult MAY 包含 `updatedAt`、`version` 与 `canWrite` 等附加元数据 #### Scenario: Write a document through the same contract
- **WHEN** 上层工作区请求write back一个the userdocument
- **THEN** `IContextProvider.writeDocument()` MUST allow以统一的 `WriteContextDocumentInput` 表达 `path`、`mimeType`、`dataBase64` 与可选版本约束
- **AND** The system MUST NOT 为 PDF 或其他二进制document再额外定义平行的 `readBinaryDocument()` 主路径 #### Scenario: Manage nodes through the same context provider contract
- **WHEN** 上层工作区请求create、delete或renamefile tree节点
- **THEN** `IContextProvider` MUST continue通过统一契约expose `createNode`、`deleteNode` 与 `renameNode`
- **AND** The system MUST NOT 为这些操作引入脱离 `IContextProvider` 的并行文件管理interface ### Requirement: Core interfaces MUST allow model providers to declare accepted document MIME types
The system MUST allow `IModelProvider` 通过可选扩展capability声明currentmodel可接受的document `mimeType`，使工作区能够在发送请求前判定currentdocument是否应entermodelinput。 #### Scenario: Provider declares accepted document MIME types
- **WHEN** 某个model provider support从工作区直接接收documentbody或attachment
- **THEN** The system MUST allow该 provider expose类似 `getDocumentCapability()` 的可选capabilityinterface
- **AND** 该capability声明 MUST 至少包含一组可接受的 `mimeType` #### Scenario: Providers without document capability remain compatible
- **WHEN** 某个model provider 未实现documentcapability声明
- **THEN** 它 MUST continue可以only通过现有 `IModelProvider` 契约工作
- **AND** 工作区 MUST 将其视为“default不接受额外document内容注入” ### Requirement: Core interfaces MUST expose conversation persistence through a dedicated persist contract
The system MUST 使用专门表达“conversation持久化”的核心契约来承载conversation CRUD capability，而不是continue同时expose `IStorageProvider` 与 `IConversationStorageProvider` 两套等价命名。该主契约 MUST 命名为 `IConversationPersistProvider`，并keep现有conversationsave、read、list和delete语义不变。 #### Scenario: Expose one canonical conversation persistence interface
- **WHEN** 核心模块导出conversation持久化相关interface
- **THEN** The system MUST provide `IConversationPersistProvider`
- **AND** 该interface MUST 至少包含 `saveConversation`、`getConversation`、`getAllConversations` 与 `deleteConversation` #### Scenario: Preserve compatibility for current conversation data model
- **WHEN** 调用方continue使用现有 `Conversation`、`ConversationMessage`、`MessageAttachment` 等conversation数据结构
- **THEN** The system MUST keep这些数据model的字段语义不变
- **AND** 本次重构 MUST NOT 借interfacerename顺带改变conversation内容结构 ### Requirement: Core interfaces MUST name external conversation sources explicitly
The system MUST 以 `IExternalConversationProvider` 作为外部conversation来源的统一契约，并通过相应的外部 provider 标识与summary类型表达其“来源于外部系统”的语义，而不是continue使用泛化的 `IHistoryProvider` 名称。 #### Scenario: Expose external source contract under explicit naming
- **WHEN** 核心模块导出外部conversation来源相关interface
- **THEN** The system MUST provide `IExternalConversationProvider`
- **AND** 相关 provider entry 类型 MUST 引用该新interface，而不是continue把“history”作为主语义 #### Scenario: Keep external conversation read behavior stable during rename
- **WHEN** 外部conversation来源实现迁移到新interface命名
- **THEN** The system MUST continuesupport外部conversationsummarylistread和detailsread
- **AND** 本次重构阶段 MUST NOT 改变这些read操作的行为约束 ### Requirement: Core interfaces MUST distinguish model runtime from other provider families
The system MUST 将model provider 装配interface明确命名为 `ModelProviderRuntime`，以表达其职责only限于model provider 的filter、directoryread与实例create，而不是广义的 provider 管理总线。 #### Scenario: Expose a model-scoped runtime contract
- **WHEN** 核心运行时模块导出 provider runtime 类型
- **THEN** The system MUST 以 `ModelProviderRuntime` 作为model运行时契约名
- **AND** 该契约 MUST continue承载 provider list、provider catalog、modeldirectory与 provider 实例获取capability #### Scenario: Keep runtime method semantics stable during rename
- **WHEN** 现有 Compare、Agent 或host装配逻辑使用model运行时
- **THEN** The system MUST keep `getAvailableProviders`、`getProviderCatalog`、`getProviderModels` 与 `getProvider` 的行为语义不变
- **AND** 本次重构 MUST NOT 顺带把其他 provider 家族注入到该 runtime 契约中 ### Requirement: Core interfaces MUST define workspace context contracts for knowledge workspaces
The system MUST 为knowledge workspace定义统一的 `WorkspaceContext` 契约，并要求 `IContextProvider` 通过 `getContext()` return该契约，而不是continue依赖逐层directory枚举与路径级 Agent resolve。`WorkspaceContext` MUST 同时provide完整directory树与 `agentConfigs` cache，使 UI 能够直接通过 `agentKey` 获取current生效 Agent。 #### Scenario: Return workspace context from the context provider
- **WHEN** 上层knowledge workspace请求上下文数据
- **THEN** `IContextProvider` MUST provide `getContext(): Promise<WorkspaceContext>`
- **AND** returnresult MUST 至少包含 `nodes` 与 `agentConfigs` #### Scenario: Reference agent configs by agent key
- **WHEN** 某个节点声明了自己的 `agentKey`
- **THEN** `WorkspaceContext.agentConfigs` MUST 包含与该 key 对应的完整 `ResolvedAgentConfig`
- **AND** 上层 UI MUST 能only通过 `agentKey + agentConfigs` 获取current Agent，而不再依赖路径级resolve ### Requirement: Core interfaces MUST define hierarchical context nodes with agent metadata
The system MUST 将knowledge workspace节点定义为层级结构，而不是onlysupport按父路径分页式枚举。`ContextNode` MUST support `children`、`isAgentOwner` 与 `agentKey`，其中 `isAgentOwner` 表示directory是否直接拥有 `.agent.json`，`agentKey` 表示该节点current生效的 Agent。 #### Scenario: Represent the full tree through nested children
- **WHEN** `IContextProvider.getContext()` returndirectory树
- **THEN** `ContextNode` MUST 能通过 `children` 表达完整subtree结构
- **AND** 上层 MUST 可以only基于这棵树完成directory遍历与节点查找 #### Scenario: Represent owner and effective agent separately
- **WHEN** `ContextNode` 表达一个directory节点
- **THEN** 该节点 MUST 能独立表达 `isAgentOwner` 与 `agentKey`
- **AND** The system MUST NOT 把“directory直接拥有 Agent”与“节点current生效 Agent”混为the same个字段 ### Requirement: Agent configs MUST automatically inherit from system fallback via merge
The system MUST 去除 `.agent.json` 中复杂的 `override` 和 `merge` 声明属性，所有的 Agent configuration MUST 隐式使用 `merge` 逻辑进行自顶向下的merge。同时，系统的global兜底configuration（Fallback）MUST 作为merge链路的最底层基底（Base），从而使得即使是最深层的子directory也能天然继承到基础的toolcapability和指令。 #### Scenario: Subfolder config without explicit tools
- **WHEN** 子directory的 `.agent.json` 只定义了 `modelName` 而没有定义 `tools`
- **THEN** `resolveScopedAgentConfig` MUST 将系统的 fallback `tools` 完好地merge进来
- **AND** 该子directory的 Agent 应当同时具备自定义的model名称和globaldefault的toollist #### Scenario: No override keyword needed
- **WHEN** the user希望完全修改上级设置
- **THEN** the user只需在 `.agent.json` 中explicitprovide自身的属性（例如重新provide空toollist或全套属性）
- **AND** 系统不再需要通过特殊的 `inheritance: 'override'` 语法来截断继承链 ### Requirement: Core interfaces MUST define conversation query lookup on the context provider
The system MUST allow `IContextProvider` provide统一的conversation只读queryinterface，并support通过 `documentPath` 条件read关联conversationlist，使knowledge workspace右栏 assistant pane 能在不依赖具体host存储实现的前提下readdocument相关对话。 #### Scenario: Expose document conversation lookup on IContextProvider
- **WHEN** 核心模块导出knowledge workspace context 契约
- **THEN** `IContextProvider` MUST provide `getConversations(query: ConversationQuery): Promise<Conversation[]>`
- **AND** 调用方 MUST 可以通过 `getConversations({ documentPath })` querydocument关联conversation
- **AND** 该interface MUST 与现有 `getContext`、`readDocument`、`writeDocument` 等capability处于the same契约中 #### Scenario: Preserve compatibility for callers that do not use document conversations
- **WHEN** 某些上层调用方只依赖directory树与document读写capability
- **THEN** 它们 MUST continue可以only按现有方式消费 `IContextProvider`
- **AND** 新增的conversationquerycapability MUST 不改变现有方法的inputoutput语义 ### Requirement: Core conversation model MUST preserve document association metadata
The system MUST allow `Conversation` 以可选字段表达其关联的一个或多个工作区document路径，使right-side assistant pane、持久化与sync链路可以围绕the same份conversation级元数据工作。 #### Scenario: Carry multiple associated document paths on a conversation
- **WHEN** 某条conversation同时关联多个工作区document
- **THEN** `Conversation` MUST 能以 `documentPaths` 表达这些路径
- **AND** 该字段 MUST allow缺省，以compatible旧conversation #### Scenario: Preserve compatibility for conversations without document associations
- **WHEN** 调用方read一条旧conversation且该conversation未包含 `documentPaths`
- **THEN** The system MUST allow该字段缺省
- **AND** 旧conversation MUST continue可以被正常read和使用
