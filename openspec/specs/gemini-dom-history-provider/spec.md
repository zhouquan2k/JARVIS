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

#### Scenario: Fetch Gemini history detail through the host bridge
- **WHEN** UI 调用 `getHistoryDetail(externalId)` 查询 Gemini 历史详情
- **THEN** 系统 MUST 通过 `GeminiHistoryBridge.getHistoryDetail(config, externalId)` 抓取对应详情
- **AND** 系统 MUST 在返回前将抓取结果标准化为统一的 `Conversation`

### Requirement: Gemini DOM history provider MUST normalize Gemini page content into shared conversation data
系统 MUST 将 Gemini 页面中的消息节点、图片和基础附件转换为 ChatPrism 共用的 `Conversation` 结构，避免将页面 DOM 细节暴露给 UI。

#### Scenario: Normalize Gemini conversation detail
- **WHEN** Gemini 页面返回的历史详情包含多条用户与助手消息
- **THEN** 系统 MUST 生成按时间顺序可渲染的线性 `messages`
- **AND** 返回的 `Conversation` MUST 包含 `origin = 'gemini-web'`、`externalId` 以及可保留的图片或基础附件数据

### Requirement: Gemini DOM history provider MUST fail with normalized recoverable errors
系统 MUST 在 Gemini 页面未登录、选择器失效、详情不存在或受控标签页不可用时返回规范化错误，而不是把底层 DOM 异常直接暴露给上层。

#### Scenario: Detect selector mismatch before scraping
- **WHEN** 远程配置声明的关键选择器在 Gemini 页面连续缺失并超过健康检查阈值
- **THEN** 系统 MUST 中断抓取并返回 `SELECTOR_MISMATCH`
- **AND** UI MUST 可以基于该错误显示“页面结构已变化，请稍后再试”之类的兜底提示

#### Scenario: Detect login-required state
- **WHEN** 系统尝试抓取 Gemini 历史但页面处于未登录、重定向或无权限状态
- **THEN** 系统 MUST 返回 `AUTH_REQUIRED`
- **AND** 系统 MUST NOT 将空白页面误判为“无历史记录”

## ADDED Requirements

### Requirement: Gemini DOM history provider MUST preserve a host-agnostic error contract
系统 MUST 在 extension 与 desktop 两类宿主下保留相同的 Gemini 外部历史错误契约，使上层 UI 可以复用同一套恢复逻辑而不感知宿主差异。

#### Scenario: Map desktop bridge failures into normalized history errors
- **WHEN** desktop 主进程 bridge 检测到登录页、错误页、选择器失配、详情缺失或受控页面不可用
- **THEN** 系统 MUST 继续返回 `AUTH_REQUIRED`、`SELECTOR_MISMATCH`、`DETAIL_NOT_FOUND` 或 `TAB_UNAVAILABLE`
- **AND** 系统 MUST NOT 将 Electron 页面内部异常直接暴露给工作台

#### Scenario: Preserve shared config failures across hosts
- **WHEN** `GeminiHistoryConfigLoader` 在任一宿主下既无法获得远程配置，也没有可用缓存或 builtin 回退
- **THEN** 系统 MUST 返回 `CONFIG_UNAVAILABLE`
- **AND** desktop 与 extension 宿主 MUST 使用同一套错误码语义
