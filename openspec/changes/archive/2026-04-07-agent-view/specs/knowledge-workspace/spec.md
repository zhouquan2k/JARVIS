## ADDED Requirements

### Requirement: Knowledge workspace MUST mark agent owner directories in the file tree
知识工作区左侧文件树 MUST 基于节点的 `isAgentOwner` 元数据为目录显示 Agent 标识图标，以帮助用户识别哪些目录直接拥有 `.agent.json`。该标识 MUST 只反映目录是否直接拥有 Agent，不得把仅继承父目录 Agent 的普通目录标记为 owner。

#### Scenario: Show an agent indicator for owner directories
- **WHEN** 文件树渲染一个目录节点且该节点的 `isAgentOwner` 为 `true`
- **THEN** 系统 MUST 在该目录节点上显示 Agent 标识图标
- **AND** 该图标 MUST 与目录名称一起可见，而不是依赖额外 hover 才出现

#### Scenario: Do not show an agent indicator for inherited directories
- **WHEN** 文件树渲染一个目录节点且该节点的 `isAgentOwner` 不为 `true`
- **THEN** 系统 MUST NOT 显示 Agent owner 标识图标
- **AND** 即使该节点的 `agentKey` 指向某个继承生效的 Agent，系统也 MUST NOT 将其误标为 owner

### Requirement: Knowledge workspace MUST mount the agent view inside the three-pane layout
知识工作区 MUST 在现有三栏布局中挂载独立的 `AgentView` 能力，而不是把目录级 Agent 资产展示塞进右侧 `AgentPane`。当当前选中目录节点为 owner 时，中间主面板 MUST 显示 `AgentView`，同时右侧 `AgentPane` MUST 继续保留。

#### Scenario: Show agent view in the middle pane for an owner directory
- **WHEN** 用户在知识工作区选中一个 `isAgentOwner === true` 的目录节点
- **THEN** 中间主面板 MUST 渲染 `AgentView`
- **AND** 右侧 `AgentPane` MUST 继续显示并使用当前节点的 `agentKey`

#### Scenario: Keep the file tree and agent pane while agent view is active
- **WHEN** `AgentView` 处于显示状态
- **THEN** 左侧文件树 MUST 继续保持可用
- **AND** 右侧 `AgentPane` MUST NOT 因中间主面板切换而被卸载为其他内容
