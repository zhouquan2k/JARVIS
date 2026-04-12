English | [中文](spec.zh-CN.md)

## ADDED Requirements

### Requirement: User-facing errors SHALL use English default messages
系统中会直接展示给用户或通过 API 响应透出的错误消息 SHALL 使用英文默认文案，且 MUST NOT 要求根据 UI locale 切换异常语言。

#### Scenario: UI-visible error is emitted
- **WHEN** 应用产生会显示在 UI 中的错误消息
- **THEN** 该错误消息 MUST 使用英文默认文案
- **AND** 系统 MUST NOT 依赖 UI locale 为该异常选择中文消息

#### Scenario: API-visible validation error is emitted
- **WHEN** server route 或 sync validation 返回会被客户端展示的错误
- **THEN** 返回的错误消息 MUST 使用英文默认文案

### Requirement: Existing error codes SHALL be reused without exception i18n dictionaries
已有错误码链路 SHALL 被继续复用，用于稳定区分错误类型；实现 MUST NOT 为异常消息新增 `en` / `zh-CN` 翻译词条或异常多语言运行时。

#### Scenario: External history error is mapped by code
- **WHEN** 外部历史链路返回 `AUTH_REQUIRED`、`DETAIL_NOT_FOUND` 或 `SELECTOR_MISMATCH`
- **THEN** UI 或 store MUST 使用该错误码选择英文默认消息
- **AND** 系统 MUST NOT 为该错误额外查询异常翻译字典

### Requirement: Internal-only logs MAY remain unchanged unless they leak to users
仅用于内部调试的日志 MAY 保持现状；如果某条消息会被 UI 展示、API 返回或恢复入口使用，则 MUST 纳入英文默认消息治理。

#### Scenario: Debug-only text is not displayed
- **WHEN** 一条日志只写入 console 且不会被用户界面或 API 响应消费
- **THEN** Phase 3 MAY 不要求修改该日志文本

#### Scenario: Message crosses user boundary
- **WHEN** 一条消息会被写入 `currentError`、`analysisError`、HTTP JSON error 或宿主恢复提示
- **THEN** 该消息 MUST 使用英文默认文案

### Requirement: External site matching text SHALL not be translated as user copy
用于匹配外部站点 DOM、aria-label、placeholder、URL 或页面文本的中文 selector / regex SHALL NOT 被视为用户可见文案；实现 MUST 保留这类匹配文本，除非能证明其不再需要。

#### Scenario: Gemini DOM selector contains Chinese matching text
- **WHEN** Gemini DOM 抓取配置包含中文 `aria-label` 或 placeholder 匹配片段
- **THEN** Phase 3 MUST NOT 因英文治理而删除该匹配片段
