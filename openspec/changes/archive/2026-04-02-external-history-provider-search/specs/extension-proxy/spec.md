## MODIFIED Requirements

### Requirement: Background Proxy Forwarding
系统 MUST 提供一个运行于 Background 的代理机制，并暴露对应的 UI 替身 Provider，以绕过浏览器插件内容脚本的 CORS 限制。代理协议 MUST 支持请求关联标识（如 `requestId`/`channelId`）以隔离普通聊天、对比分析与外部历史查询等并发流，并支持多模态发送参数与标准化的结构化流式更新。

#### Scenario: Proxy sendMessage to actual provider with request correlation
- **WHEN** UI 层调用 `BackgroundProxyProvider.sendMessage` 并附带所需配置项及 Payload（如 `{ providerId: 'gemini-api', modelId: 'gemini-2.5-flash', attachments: [...] }`）
- **THEN** 替身 Provider MUST 通过长连接将指令发送至 Background 脚本，且消息 MUST 携带可关联的请求标识
- **AND** Background MUST 作为无状态路由分发引擎，根据 `providerId` 动态实例化对应真实 Provider
- **AND** Background 随后 MUST 向该 Provider 发起真实请求，并按请求标识将标准化的 `ProviderStreamUpdate` 流独立回传到对应前端请求上下文

#### Scenario: Proxy forwards comparison analysis request through background
- **WHEN** UI 层发送分析指令（例如 `ANALYZE_COMPARISON`）并包含 `prompt`、`outputA`、`outputB`
- **THEN** Background MUST 在后台执行分析流程并流式回传分析增量
- **AND** UI MUST 仅消费与该分析请求标识匹配的回包数据，不得与 A/B 原生输出流混淆

#### Scenario: Proxy forwards external history list request
- **WHEN** UI 层发送 `GET_HISTORY_LIST` 指令并包含目标历史 provider 标识，且未提供 `query` 或 `query` 为空
- **THEN** Background MUST 解析该请求并调用对应历史 provider 的最近列表查询能力
- **AND** Background MUST 以与请求标识关联的结果回包返回标准化历史摘要数组

#### Scenario: Proxy forwards searched external history list request
- **WHEN** UI 层发送 `GET_HISTORY_LIST` 指令并包含目标历史 provider 标识与非空 `query`
- **THEN** Background MUST 将该 `query` 原样透传给对应历史 provider 的列表查询能力
- **AND** Background MUST 以与请求标识关联的结果回包返回标准化搜索结果摘要数组

#### Scenario: Proxy forwards external history detail request
- **WHEN** UI 层发送 `GET_HISTORY_DETAIL` 指令并包含 `externalId`
- **THEN** Background MUST 获取对应的远端历史详情并在回包前完成标准化转换
- **AND** UI MUST 收到统一的 `Conversation` 结果而不是第三方原始树状数据

#### Scenario: Proxy forwards provider model catalog request
- **WHEN** UI 层发送 `GET_AVAILABLE_MODELS` 指令并包含目标 provider 标识
- **THEN** Background MUST 调用对应 provider 的模型目录查询能力
- **AND** Background MUST 以与请求标识关联的结果回包返回 `models/defaultModel`

#### Scenario: Abort targets the intended in-flight request
- **WHEN** UI 层发送 `abort` 指令并携带目标请求标识
- **THEN** Background MUST 仅中止对应请求的 Provider 调用
- **AND** 其他并发中的请求流 MUST 保持继续执行
