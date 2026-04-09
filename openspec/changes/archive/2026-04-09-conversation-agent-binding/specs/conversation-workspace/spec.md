## ADDED Requirements

### Requirement: Local history sidebar MUST provide manual agent binding for local conversations
系统 MUST 在普通对话工作台左侧本地历史列表中，为每条本地普通会话提供手动 Agent 绑定入口。该入口 MUST 支持把会话绑定到当前工作区可解析到的某个 Agent、绑定到默认根作用域 Agent，或清空已有绑定。

#### Scenario: Bind a local conversation to a scoped agent from the sidebar
- **WHEN** 用户在左侧本地历史项上打开“绑定 Agent”入口并选择某个 scoped Agent
- **THEN** 系统 MUST 将该会话的 `conversation.agentKey` 更新为所选 Agent 对应的 key
- **AND** 该更新 MUST 持久化到现有本地会话存储中

#### Scenario: Clear an existing agent binding from the sidebar
- **WHEN** 用户在左侧本地历史项上选择“不绑定”
- **THEN** 系统 MUST 清空该会话已有的 `conversation.agentKey`
- **AND** 该会话后续 MUST 不再出现在任何按 `agentKey` 聚合的 Agent 会话列表中

#### Scenario: Load binding candidates from the workspace context
- **WHEN** 用户首次打开左侧本地历史项的“绑定 Agent”入口
- **THEN** 系统 MUST 基于当前工作区 `contextProvider.getContext()` 返回的 `agentConfigs` 构造可选 Agent 列表
- **AND** 该列表 MUST 同时包含默认根作用域 Agent 以及当前工作区中可解析到的 scoped agents

#### Scenario: Keep normal chat execution semantics unchanged after manual binding
- **WHEN** 用户已经为一条本地普通会话手动设置了 `conversation.agentKey`
- **THEN** 用户在普通对话工作台继续发送后续消息时，系统 MUST NOT 仅因该手动绑定而自动切换实际执行 Agent
- **AND** 手动绑定 MUST 只影响该会话在 Agent 相关列表中的归属与展示
