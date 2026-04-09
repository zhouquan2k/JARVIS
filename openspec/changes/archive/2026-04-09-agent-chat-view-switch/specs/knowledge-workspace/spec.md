## MODIFIED Requirements

### Requirement: Knowledge workspace MUST provide a default assistant pane that is bound to the active scope agent
知识工作区的右栏 MUST 默认渲染真实的 AI 对话 pane，并将其绑定到当前激活文件或目录解析得到的生效 Agent 上下文，而不是始终以全局固定的通用聊天身份运行。该 pane MUST 继续复用现有聊天详情视图，但在当前选中节点为文档时，右栏 MUST 先进入该文档的关联会话列表，在当前选中节点为绑定 Agent 的目录时，右栏 MUST 先进入该 Agent 的本地会话列表，再由用户切换到具体会话详情。文档关联会话列表 MUST 通过 `IContextProvider` 提供的通用会话查询能力获取，而目录级 Agent 会话列表 MUST 复用当前 `agentKey` 作用域下的本地会话聚合结果，而不是另起一套列表实现。该工作区在从对话模式返回时 MUST 恢复之前保存的选中节点、活动路径与当前会话详情，使 Agent 主视图继续停留在离开前的上下文上。

#### Scenario: Render the default assistant pane with the active scope agent
- **WHEN** 宿主进入知识工作区且当前激活节点已经解析出一个生效 Agent
- **THEN** 系统 MUST 在右栏渲染默认的 `AgentPane`
- **AND** 该 pane MUST 继续复用现有聊天详情视图并通过 `AgentRuntime` 发送当前 Agent 上下文请求，而不是忽略文件树作用域

#### Scenario: Pass workspace context with assistant requests
- **WHEN** 知识工作区右栏 Agent 发送一次请求
- **THEN** 系统 MUST 将当前 `activePath`、`contextProvider` 以及可用的 `activeDocument` 一并传给 `AgentRuntime`
- **AND** 后续文件工具执行 MUST 能使用这组工作区上下文

#### Scenario: Restore the saved Agent view state after returning from chat mode
- **WHEN** 用户从对话模式切回知识工作区
- **THEN** 系统 MUST 恢复切换前保存的选中节点、活动路径和当前会话详情
- **AND** 恢复后右栏 MUST 继续显示对应节点下的 Agent 对话内容

#### Scenario: Fall back safely when the saved Agent view state is stale
- **WHEN** 保存的选中节点或会话在切回知识工作区前已经失效
- **THEN** 系统 MUST 回退到最近可用的父节点或根节点
- **AND** 系统 MUST 保持右栏可继续使用，而不是抛出无法恢复的错误态

#### Scenario: Default to a document-scoped conversation list when a document is selected
- **WHEN** 用户在知识工作区当前选中一个文档节点
- **THEN** 右侧 `AgentPane` MUST 默认显示该文档的关联会话列表，而不是直接进入某条会话详情
- **AND** 该列表 MUST 保持当前生效 `agentKey` 作用域，不得混入其他 Agent 的会话

#### Scenario: Load document-scoped conversations through the context provider
- **WHEN** 右侧 `AgentPane` 需要展示当前文档的关联会话列表
- **THEN** 系统 MUST 通过 `IContextProvider.getConversations({ documentPath })` 读取该列表
- **AND** UI MUST NOT 直接以本地 `chatStore.conversations` 作为唯一数据源拼装结果

#### Scenario: Keep assistant detail mode for directory selections
- **WHEN** 用户当前选中的是目录节点而不是文档节点
- **THEN** 右侧 `AgentPane` MUST 继续显示聊天详情视图
- **AND** 系统 MUST NOT 因目录选中态强制进入文档会话列表

#### Scenario: Default to an agent-scoped conversation list when an agent-bound directory is selected
- **WHEN** 用户在知识工作区当前选中一个绑定了 Agent 的目录节点
- **THEN** 右侧 `AgentPane` MUST 默认显示属于当前 `agentKey` 的本地会话列表
- **AND** 该列表 MUST NOT 混入其他 Agent 作用域的会话
