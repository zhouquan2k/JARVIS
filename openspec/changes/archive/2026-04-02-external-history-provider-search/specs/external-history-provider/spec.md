## MODIFIED Requirements

### Requirement: External history provider MUST return first-page conversation summaries
系统 MUST 通过独立的 `IHistoryProvider` 返回外部历史摘要列表，并允许不同 provider 通过统一契约同时支持“最近列表”和“可选关键词搜索”。当 `getHistoryList()` 未提供 `query` 或 `query` 为空时，系统 MUST 返回最近一页远端会话摘要；当 `query` 为非空字符串时，系统 MUST 返回该 provider 对应关键词的搜索结果摘要列表。

#### Scenario: Fetch first page of external history
- **WHEN** UI 调用某个外部 provider 的 `getHistoryList()`，且未传入 `query` 或传入空字符串
- **THEN** 系统 MUST 返回最近一页的远端会话摘要列表
- **AND** 每条摘要 MUST 至少包含外部 ID、标题、更新时间和 `origin`

#### Scenario: Fetch searched external history summaries
- **WHEN** UI 调用某个外部 provider 的 `getHistoryList({ query })`，且 `query` 为非空字符串
- **THEN** 系统 MUST 返回该 provider 基于该关键词的搜索结果摘要列表
- **AND** 返回结构 MUST 与最近列表保持同一 `ConversationHistorySummary` 契约
