## MODIFIED Requirements

### Requirement: Agent view MUST list local conversations by agent key
`AgentView` MUST 展示当前 Agent 对应的本地会话列表，并以 `conversation.agentKey === 当前 agentKey` 作为唯一过滤条件。该规则 MUST 同时适用于知识工作区自动绑定的会话与用户后续在普通对话工作台中手动绑定到该 key 的本地会话。

#### Scenario: Show only local conversations belonging to the current agent key
- **WHEN** `AgentView` 渲染当前 Agent 的会话列表
- **THEN** 系统 MUST 只显示 `conversation.agentKey === 当前 agentKey` 的本地会话
- **AND** 系统 MUST NOT 混入无 `agentKey` 的普通聊天会话或其他 Agent 的会话

#### Scenario: Include manually bound local conversations in the agent view
- **WHEN** 用户在普通对话工作台中将一条本地会话手动绑定到当前 `agentKey`
- **THEN** `AgentView` MUST 将该会话视为当前 Agent 的本地会话并展示出来
- **AND** 系统 MUST NOT 要求该会话必须源自知识工作区自动绑定链路

#### Scenario: Switch to a local conversation from the agent view
- **WHEN** 用户在 `AgentView` 中点击一条会话记录
- **THEN** 系统 MUST 切换当前本地活动会话到该记录
- **AND** 右侧 `AgentPane` MUST 随之显示该会话的消息线程
