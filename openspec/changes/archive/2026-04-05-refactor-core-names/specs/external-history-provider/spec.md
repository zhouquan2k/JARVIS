## MODIFIED Requirements

### Requirement: External history provider MUST return first-page conversation summaries
系统 MUST 通过独立的 `IExternalConversationProvider` 返回外部历史摘要列表，并允许不同 provider 通过统一契约同时支持“最近列表”和“可选关键词搜索”。当 `getHistoryList()` 未提供 `query` 或 `query` 为空时，系统 MUST 返回最近一页远端会话摘要；当 `query` 为非空字符串时，系统 MUST 返回该 provider 对应关键词的搜索结果摘要列表。

#### Scenario: Fetch first page of external history through renamed provider contract
- **WHEN** UI 调用某个外部 provider 的 `getHistoryList()`，且未传入 `query` 或传入空字符串
- **THEN** 系统 MUST 通过 `IExternalConversationProvider` 契约返回最近一页的远端会话摘要列表
- **AND** 每条摘要 MUST 至少包含外部 ID、标题、更新时间和 `origin`

#### Scenario: Keep search behavior stable during provider rename
- **WHEN** 调用方从 `IHistoryProvider` 迁移到 `IExternalConversationProvider`
- **THEN** `getHistoryList({ query })` MUST 继续返回对应关键词的搜索结果摘要列表
- **AND** 返回结构 MUST 与最近列表保持同一摘要契约

### Requirement: External history provider MUST normalize detail into shared Conversation model
系统 MUST 将外部历史详情转换为统一的线性 `Conversation` 数据结构，再交给 UI 渲染和导入流程使用。该详情读取能力在接口重命名后 MUST 保持不变。

#### Scenario: Keep detail normalization stable during provider rename
- **WHEN** UI 调用 `getHistoryDetail(externalId)`
- **THEN** 系统 MUST 返回一个标准化的 `Conversation`
- **AND** 返回结果 MUST 继续包含 `externalId`、`backendId`、`origin` 和线性 `messages`
