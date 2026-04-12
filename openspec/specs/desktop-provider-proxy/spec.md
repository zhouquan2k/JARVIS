English | [中文](spec.zh-CN.md)

## ADDED Requirements

### Requirement: Desktop proxy MUST forward provider requests through IPC with correlation identifiers
系统 MUST 提供一个运行于桌面 renderer 的代理机制，并通过 IPC 将请求转发至 host 中的真实 provider。该代理协议 MUST 支持请求关联标识（如 `requestId`、`channelId`），以隔离普通聊天、对比分析与外部历史查询等并发流。

#### Scenario: Proxy forwards sendMessage to host provider
- **WHEN** UI 层调用 `DesktopProxyProvider.sendMessage` 并附带目标 `providerId`、模型配置和消息负载
- **THEN** 代理层 MUST 通过 IPC 将请求发送到 host
- **AND** 该请求 MUST 携带可关联的请求标识，以便将流式更新回传到正确的前端上下文

#### Scenario: Proxy forwards provider model catalog request
- **WHEN** UI 层调用桌面代理查询某个 provider 的模型目录
- **THEN** host MUST 调用对应真实 provider 的模型目录能力
- **AND** 代理层 MUST 返回标准化的 `models/defaultModel` 结果

### Requirement: Desktop proxy MUST stream updates and terminal events independently per request
桌面代理 MUST 将 host 返回的增量更新、完成事件和错误事件按请求标识独立回传，避免不同并发请求之间相互串流。

#### Scenario: Proxy streams model output to the matching request
- **WHEN** host 在某个请求生命周期中持续产出 `ProviderStreamUpdate`
- **THEN** 桌面代理 MUST 只将这些更新推送给与该请求标识匹配的前端回调
- **AND** 其他并发中的请求 MUST 保持互不干扰

#### Scenario: Proxy forwards analysis result independently
- **WHEN** UI 层发起对比分析请求并附带 `prompt`、`outputA`、`outputB`
- **THEN** host MUST 在后台执行分析流程
- **AND** 分析增量与最终结果 MUST 仅回传到对应分析请求上下文

### Requirement: Desktop proxy MUST forward external history requests through host
桌面代理 MUST 将外部历史列表与详情请求转发至 host，并由 host 统一执行 provider 调用与标准化转换。对于历史列表请求，代理协议 MUST 同时支持“最近列表”和“关键词搜索”：当 `query` 为空时返回最近列表；当 `query` 为非空字符串时，host MUST 将该关键词透传给目标历史 provider 的列表查询能力。

#### Scenario: Proxy forwards history list request
- **WHEN** UI 层发起 `GET_HISTORY_LIST` 请求并指定目标历史 provider，且未提供 `query` 或 `query` 为空
- **THEN** host MUST 调用对应历史 provider 的最近列表查询能力
- **AND** 代理层 MUST 返回标准化历史摘要数组

#### Scenario: Proxy forwards searched history list request
- **WHEN** UI 层发起 `GET_HISTORY_LIST` 请求并指定目标历史 provider，且 `query` 为非空字符串
- **THEN** host MUST 将该 `query` 透传给对应历史 provider 的列表查询能力
- **AND** 代理层 MUST 返回标准化搜索结果摘要数组

#### Scenario: Proxy forwards history detail request
- **WHEN** UI 层发起 `GET_HISTORY_DETAIL` 请求并附带 `externalId`
- **THEN** host MUST 查询对应远端历史详情
- **AND** 返回结果 MUST 为标准化后的 `Conversation`

### Requirement: Desktop proxy MUST support aborting the intended in-flight request
桌面代理 MUST 支持按目标请求标识中止正在执行的 provider 请求，而不影响其他并发请求。

#### Scenario: Abort only affects the targeted request
- **WHEN** UI 层发送中止指令并指定目标请求标识
- **THEN** host MUST 仅中止该请求关联的 provider 调用
- **AND** 其他正在执行的请求 MUST 继续保持运行
