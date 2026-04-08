## ADDED Requirements

### Requirement: Knowledge context provider MUST support document-scoped conversation queries
知识文件 Provider MUST 提供统一的会话只读查询能力，并支持通过文档路径读取关联会话列表，以支持右侧 `AgentPane` 在选中文档时展示该文档的相关对话。该查询能力 MUST 以 `Conversation.documentPaths` 包含目标路径作为主过滤条件，并保持与当前工作区上下文一致的结果语义。

#### Scenario: Return conversations associated with a document path
- **WHEN** 上层工作区请求读取某个文档路径的关联会话列表
- **THEN** Provider MUST 支持 `getConversations({ documentPath })`
- **AND** 返回所有 `documentPaths` 包含该路径的会话
- **AND** 返回结果 MUST 至少包含会话 `id`、`title`、`agentKey`、`documentPaths`、`messages` 与 `updatedAt`

#### Scenario: Match exact document paths instead of fuzzy prefixes
- **WHEN** 两条会话分别关联 `/docs/a.md` 与 `/docs/a.md.bak`
- **THEN** 对 `/docs/a.md` 的会话查询 MUST 只返回前者
- **AND** Provider MUST NOT 通过前缀或模糊匹配混入其他路径

#### Scenario: Return an empty list when no conversations are associated
- **WHEN** 目标文档当前没有任何关联会话
- **THEN** Provider MUST 返回空数组
- **AND** 系统 MUST NOT 将其视为错误

#### Scenario: Preserve compatibility for providers backed by different storage implementations
- **WHEN** 某个具体 Provider 通过本地文件、数据库或其他后端维护知识工作区上下文
- **THEN** 它 MUST 在不改变 `IContextProvider` 统一契约的前提下实现该会话查询能力
- **AND** 上层 UI MUST 无需感知其底层会话存储来源
