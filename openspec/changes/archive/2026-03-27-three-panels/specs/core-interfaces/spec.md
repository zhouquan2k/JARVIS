## MODIFIED Requirements

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

## ADDED Requirements

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
