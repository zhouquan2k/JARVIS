## MODIFIED Requirements

### Requirement: Gemini DOM history provider MUST fetch history through remote-config-driven selectors
系统 MUST 在共享 core 层提供一个 Gemini DOM 历史提供者，并通过宿主注入的 `GeminiHistoryBridge` 与远程配置下发的选择器抓取 Gemini 官网的历史列表与详情。该提供者 MUST 同时适用于 extension 与 desktop 宿主，而不是绑定单一宿主实现。

#### Scenario: Fetch Gemini history list through the host bridge
- **WHEN** extension 或 desktop 宿主中的外部历史工作台激活 `gemini-web` provider 且 UI 调用 `getHistoryList()`
- **THEN** 系统 MUST 先由 `GeminiHistoryConfigLoader` 解析远程配置、缓存配置或 builtin 回退配置
- **AND** 系统 MUST 通过宿主注入的 `GeminiHistoryBridge.getHistoryList(config)` 抓取历史摘要
- **AND** 返回结果 MUST 统一映射为包含 `id`、`title`、`updatedAt`、`origin = 'gemini-web'` 的摘要数组

#### Scenario: Fetch Gemini history detail through the host bridge
- **WHEN** UI 调用 `getHistoryDetail(externalId)` 查询 Gemini 历史详情
- **THEN** 系统 MUST 通过 `GeminiHistoryBridge.getHistoryDetail(config, externalId)` 抓取对应详情
- **AND** 系统 MUST 在返回前将抓取结果标准化为统一的 `Conversation`

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
