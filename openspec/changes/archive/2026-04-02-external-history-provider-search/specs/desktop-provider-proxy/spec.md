## MODIFIED Requirements

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
