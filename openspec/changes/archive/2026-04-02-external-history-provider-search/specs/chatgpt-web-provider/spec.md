## ADDED Requirements

### Requirement: ChatGPT Web provider MUST support searchable history summaries
系统 MUST 为 ChatGPT 网页版历史 provider 提供可搜索的摘要列表查询能力，并继续复用统一的 `ConversationHistorySummary` 契约。该能力 MUST 同时支持“最近列表”和“关键词搜索”两种查询模式，而不改变现有详情读取与标准化行为。

#### Scenario: Return recent ChatGPT history summaries without query
- **WHEN** UI 调用 `ChatGPTWebProvider.getHistoryList()`，且未传入 `query` 或传入空字符串
- **THEN** Provider MUST 返回最近一页 ChatGPT 历史摘要列表
- **AND** 每条摘要 MUST 包含 `id`、`title`、`updatedAt` 与 `origin = 'chatgpt-web'`

#### Scenario: Return searched ChatGPT history summaries with query
- **WHEN** UI 调用 `ChatGPTWebProvider.getHistoryList({ query })`，且 `query` 为非空字符串
- **THEN** Provider MUST 调用 ChatGPT 原生历史搜索能力并返回匹配结果
- **AND** 返回结果 MUST 继续标准化为统一的 `ConversationHistorySummary[]`
