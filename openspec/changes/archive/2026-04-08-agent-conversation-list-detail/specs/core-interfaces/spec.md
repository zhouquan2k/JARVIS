## ADDED Requirements

### Requirement: Core interfaces MUST define conversation query lookup on the context provider
系统 MUST 允许 `IContextProvider` 提供统一的会话只读查询接口，并支持通过 `documentPath` 条件读取关联会话列表，使知识工作区右栏 assistant pane 能在不依赖具体宿主存储实现的前提下读取文档相关对话。

#### Scenario: Expose document conversation lookup on IContextProvider
- **WHEN** 核心模块导出知识工作区 context 契约
- **THEN** `IContextProvider` MUST 提供 `getConversations(query: ConversationQuery): Promise<Conversation[]>`
- **AND** 调用方 MUST 可以通过 `getConversations({ documentPath })` 查询文档关联会话
- **AND** 该接口 MUST 与现有 `getContext`、`readDocument`、`writeDocument` 等能力处于同一契约中

#### Scenario: Preserve compatibility for callers that do not use document conversations
- **WHEN** 某些上层调用方只依赖目录树与文档读写能力
- **THEN** 它们 MUST 继续可以仅按现有方式消费 `IContextProvider`
- **AND** 新增的会话查询能力 MUST 不改变现有方法的输入输出语义

### Requirement: Core conversation model MUST preserve document association metadata
系统 MUST 允许 `Conversation` 以可选字段表达其关联的一个或多个工作区文档路径，使右侧 assistant pane、持久化与同步链路可以围绕同一份会话级元数据工作。

#### Scenario: Carry multiple associated document paths on a conversation
- **WHEN** 某条会话同时关联多个工作区文档
- **THEN** `Conversation` MUST 能以 `documentPaths` 表达这些路径
- **AND** 该字段 MUST 允许缺省，以兼容旧会话

#### Scenario: Preserve compatibility for conversations without document associations
- **WHEN** 调用方读取一条旧会话且该会话未包含 `documentPaths`
- **THEN** 系统 MUST 允许该字段缺省
- **AND** 旧会话 MUST 继续可以被正常读取和使用
