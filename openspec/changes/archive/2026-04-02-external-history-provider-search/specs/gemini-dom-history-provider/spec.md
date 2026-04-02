## MODIFIED Requirements

### Requirement: Gemini DOM history provider MUST fetch history through remote-config-driven selectors
系统 MUST 在共享 core 层提供一个 Gemini DOM 历史提供者，并通过宿主注入的 `GeminiHistoryBridge` 与远程配置下发的选择器抓取 Gemini 官网的历史列表与详情。该提供者 MUST 同时适用于 extension 与 desktop 宿主，而不是绑定单一宿主实现。该历史列表查询 MUST 同时支持“最近列表”和“关键词搜索”两种模式：当 `query` 为空时返回最近列表；当 `query` 为非空字符串时，系统 MUST 通过远程配置驱动页面原生搜索框，再抽取搜索结果摘要。

#### Scenario: Fetch Gemini history list through the host bridge
- **WHEN** extension 或 desktop 宿主中的外部历史工作台激活 `gemini-web` provider 且 UI 调用 `getHistoryList()`，且未传入 `query` 或传入空字符串
- **THEN** 系统 MUST 先由 `GeminiHistoryConfigLoader` 解析远程配置、缓存配置或 builtin 回退配置
- **AND** 系统 MUST 通过宿主注入的 `GeminiHistoryBridge.getHistoryList(config, { query: '' })` 或等价空查询语义抓取最近历史摘要
- **AND** 返回结果 MUST 统一映射为包含 `id`、`title`、`updatedAt`、`origin = 'gemini-web'` 的摘要数组

#### Scenario: Fetch Gemini searched history list through the host bridge
- **WHEN** extension 或 desktop 宿主中的外部历史工作台激活 `gemini-web` provider 且 UI 调用 `getHistoryList({ query })`，且 `query` 为非空字符串
- **THEN** 系统 MUST 先由 `GeminiHistoryConfigLoader` 解析远程配置、缓存配置或 builtin 回退配置
- **AND** 系统 MUST 通过宿主注入的 `GeminiHistoryBridge.getHistoryList(config, { query })` 驱动 Gemini 页面原生搜索框并抓取匹配结果摘要
- **AND** 返回结果 MUST 继续统一映射为 `origin = 'gemini-web'` 的摘要数组
