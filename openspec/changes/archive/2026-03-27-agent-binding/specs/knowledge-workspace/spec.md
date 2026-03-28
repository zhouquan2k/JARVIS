## MODIFIED Requirements

### Requirement: Knowledge workspace MUST provide a default assistant pane that is bound to the active scope agent
知识工作区的右栏 MUST 默认渲染真实的 AI 对话 pane，并将其绑定到当前激活文件或目录解析得到的生效 Agent 上下文，而不是始终以全局固定的通用聊天身份运行。该 pane MUST 继续复用现有聊天视图，但其发送链路 MUST 感知当前作用域 Agent 的名称、目标模型、指令和能力边界。

#### Scenario: Render the default assistant pane with the active scope agent
- **WHEN** 宿主进入知识工作区且当前激活节点已经解析出一个生效 Agent
- **THEN** 系统 MUST 在右栏渲染默认的 `KnowledgeAssistantPane`
- **AND** 该 pane MUST 以当前生效 Agent 作为聊天上下文，而不是忽略文件树作用域

#### Scenario: Fall back to the default agent in the assistant pane
- **WHEN** 当前激活节点及其父目录都不存在 `.agent.json`
- **THEN** 右栏 AI pane MUST 退回到全局默认 Agent
- **AND** 用户仍然 MUST 可以继续以普通聊天方式使用该 pane

#### Scenario: Selecting a directory updates the effective assistant agent immediately
- **WHEN** 用户在知识工作区左侧点击一个目录节点，但未打开新文件
- **THEN** 系统 MUST 立即以该目录路径重新解析并切换右栏生效 Agent
- **AND** 系统 MUST NOT 要求用户必须先打开该目录下的文件才更新右栏身份

## ADDED Requirements

### Requirement: Knowledge workspace MUST surface effective agent metadata for the active node
知识工作区 MUST 为当前激活节点展示生效 Agent 的关键信息，以便用户确认当前 AI 身份、最近命中的配置来源目录、模型信息和解析状态。

#### Scenario: Show the current effective agent in the assistant pane
- **WHEN** 当前激活节点成功解析出一个生效 Agent
- **THEN** 系统 MUST 在 `NormalChatView` 上方的固定顶部区域显示该 Agent 的名称、模型 Provider / 模型名称与最近命中的 `.agent.json` 所在目录
- **AND** 当当前节点及父目录都没有命中 `.agent.json` 时，系统 MUST 退回显示默认 Agent 的根作用域 `/`

#### Scenario: Show agent resolution errors without blocking document editing
- **WHEN** 当前节点命中的 `.agent.json` 非法或解析失败
- **THEN** 系统 MUST 在右栏显示明确的 Agent 解析错误
- **AND** 左侧文件树浏览与中间文档编辑 MUST 继续保持可用
