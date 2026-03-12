## ADDED Requirements

### Requirement: Gemini DOM history provider MUST fetch history through remote-config-driven selectors
系统 MUST 提供一个 Gemini DOM 历史提供者，并在浏览器扩展运行时通过远程配置下发的选择器抓取 Gemini 官网的历史列表与详情。

#### Scenario: Fetch Gemini history list with remote config
- **WHEN** 外部历史工作台激活 `gemini-web` provider 且 UI 调用 `getHistoryList()`
- **THEN** 系统 MUST 使用远程配置中的列表选择器在 Gemini 页面抓取最近一页历史摘要
- **AND** 返回结果 MUST 统一映射为包含 `id`、`title`、`updatedAt`、`origin = 'gemini-web'` 的摘要数组

#### Scenario: Fetch Gemini history detail with controlled tab
- **WHEN** UI 调用 `getHistoryDetail(externalId)` 查询 Gemini 历史详情
- **THEN** 系统 MUST 通过受控标签页与内容脚本在 Gemini 页面抓取对应对话详情
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
