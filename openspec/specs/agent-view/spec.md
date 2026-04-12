English | [中文](spec.zh-CN.md)

## ADDED Requirements

### Requirement: Agent view MUST render only for selected agent owner directories
系统 MUST 将 `AgentView` 作为目录级 Agent 资产总览视图，并且只在知识工作区当前选中节点为目录且 `isAgentOwner === true` 时渲染该视图。`AgentView` MUST 统一通过 `ownerNode.agentKey` 与 `agentConfigs[agentKey]` 获取当前 Agent，而不是再按路径单独解析。

#### Scenario: Render agent view for an owner directory
- **WHEN** 用户在知识工作区选中一个目录节点，且该节点的 `isAgentOwner` 为 `true`
- **THEN** 系统 MUST 在中间主面板渲染 `AgentView`
- **AND** `AgentView` MUST 使用该节点的 `agentKey` 与 `agentConfigs[agentKey]` 作为当前 Agent 数据源

#### Scenario: Do not render agent view for a non-owner selection
- **WHEN** 用户选中一个文件节点，或选中 `isAgentOwner !== true` 的目录节点
- **THEN** 系统 MUST NOT 渲染 `AgentView`
- **AND** 中间主面板 MUST 继续显示原有文档查看或编辑内容

### Requirement: Agent view MUST display current agent details and scoped markdown documents
`AgentView` MUST 展示当前 Agent 的名称、作用域、模型和有效提示词，并且只展示当前 owner 目录子树下的 Markdown 文档列表。该文档列表 MUST 基于 `ownerNode.children` 子树过滤 `.md` 与 `.markdown` 文件，而不是重新请求 provider。

#### Scenario: Show agent metadata in the agent view
- **WHEN** `AgentView` 使用某个 `agentKey` 成功解析到当前 Agent
- **THEN** 系统 MUST 显示该 Agent 的名称、作用域、模型和有效提示词
- **AND** 这些信息 MUST 来自 `agentConfigs[agentKey]`

#### Scenario: List only markdown documents under the owner subtree
- **WHEN** `AgentView` 渲染当前 owner 目录的文档列表
- **THEN** 系统 MUST 仅列出该目录子树中的 `.md` 与 `.markdown` 文件
- **AND** 系统 MUST NOT 列出 `.agent.json`、PDF 或其他非 Markdown 文件

#### Scenario: Open a markdown document from the agent view
- **WHEN** 用户在 `AgentView` 中点击一条 Markdown 文档
- **THEN** 系统 MUST 打开该文档并切换主面板到对应文档查看或编辑状态
- **AND** 系统 MUST 继续保留右侧 `AgentPane` 的聊天区域

### Requirement: Agent view MUST list local conversations by agent key
`AgentView` MUST 展示当前 Agent 对应的本地会话列表，并以 `conversation.agentKey === 当前 agentKey` 作为唯一过滤条件。该规则 MUST 同时适用于真实目录 Agent 与 provider 内部默认兜底 Agent，只要会话是在知识工作区 Agent 链路中由该 key 回答的。

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
