## MODIFIED Requirements

### Requirement: Knowledge workspace MUST provide a default assistant pane that is bound to the active scope agent
知识工作区的右栏 MUST 默认渲染真实的 AI 对话 pane，并将其绑定到当前激活文件或目录解析得到的生效 Agent 上下文，而不是始终以全局固定的通用聊天身份运行。该 pane MUST 继续复用现有聊天详情视图，但在当前选中节点为文档时，右栏 MUST 先进入该文档的关联会话列表，在当前选中节点为绑定 Agent 的目录时，右栏 MUST 先进入该 Agent 的本地会话列表，再由用户切换到具体会话详情。文档关联会话列表 MUST 通过 `IContextProvider` 提供的通用会话查询能力获取，而目录级 Agent 会话列表 MUST 复用当前 `agentKey` 作用域下的本地会话聚合结果，而不是另起一套列表实现。

#### Scenario: Render the default assistant pane with the active scope agent
- **WHEN** 宿主进入知识工作区且当前激活节点已经解析出一个生效 Agent
- **THEN** 系统 MUST 在右栏渲染默认的 `AgentPane`
- **AND** 该 pane MUST 继续复用现有聊天详情视图并通过 `AgentRuntime` 发送当前 Agent 上下文请求，而不是忽略文件树作用域

#### Scenario: Pass workspace context with assistant requests
- **WHEN** 知识工作区右栏 Agent 发送一次请求
- **THEN** 系统 MUST 将当前 `activePath`、`contextProvider` 以及可用的 `activeDocument` 一并传给 `AgentRuntime`
- **AND** 后续文件工具执行 MUST 能使用这组工作区上下文

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

#### Scenario: Reuse the existing conversation list component for agent-bound directories
- **WHEN** 系统在右侧 `AgentPane` 中展示绑定 Agent 的目录级会话列表
- **THEN** 系统 MUST 复用当前列表/详情双态面板中的现有会话列表组件
- **AND** 系统 MUST NOT 为目录级 Agent 会话再创建一套独立的右侧列表交互

#### Scenario: Include the active document only when the provider accepts its MIME type
- **WHEN** 当前知识工作区节点是一个文件且右栏 Agent 发起请求
- **THEN** Agent 运行时请求契约 MUST 允许程序侧根据模型 provider 声明的文档能力决定是否附带该 `activeDocument`
- **AND** 当 provider 未声明接受当前 `mimeType` 时，系统 MUST NOT 把该文档内容作为正文或附件直接注入模型输入

#### Scenario: Expose the actual first-turn document input for document association
- **WHEN** 首轮请求真实采纳了当前文档作为模型输入附件
- **THEN** 系统 MUST 将该文档作为真实请求的一部分写回当前 user message 的历史记录
- **AND** 后续文档关联关系 MUST 基于这份真实请求快照建立，而不是仅凭 UI 选中态推断

#### Scenario: Follow-up turns replay prior document context from history only
- **WHEN** 同一会话进入后续 follow-up 提问
- **THEN** 系统 MUST 优先依赖已持久化的消息 history 重放先前文档上下文
- **AND** 系统 MUST NOT 仅因当前工作区仍选中同一个文件，就再次自动附加已经存在于 history 中的旧文档

#### Scenario: Changing the active node does not retroactively replace conversation context
- **WHEN** 用户在会话创建后切换了工作区当前节点，但没有显式将新文件添加到对话
- **THEN** 系统 MUST NOT 自动用新节点替换当前会话已经固定下来的文档上下文
- **AND** 后续请求 MUST 继续以历史中已记录的真实上下文为准

#### Scenario: Fall back to the default agent in the assistant pane
- **WHEN** 当前激活节点及其父目录都不存在 `.agent.json`
- **THEN** 右栏 AI pane MUST 退回到全局默认 Agent
- **AND** 用户仍然 MUST 可以继续以普通聊天方式使用该 pane

#### Scenario: Selecting a directory updates the effective assistant agent immediately
- **WHEN** 用户在知识工作区左侧点击一个目录节点，但未打开新文件
- **THEN** 系统 MUST 立即以该目录路径重新解析并切换右栏生效 Agent
- **AND** 系统 MUST NOT 要求用户必须先打开该目录下的文件才更新右栏身份

## ADDED Requirements

### Requirement: Assistant pane MUST provide list-detail navigation for document conversations
当右侧 `AgentPane` 处于文档关联会话详情态时，系统 MUST 在 `NormalChatView` 之外提供一个由外层面板管理的顶部导航区，以支持回到列表和识别当前对话标题。该导航能力 MUST 属于 `AgentPane` 外层状态，而不是通用聊天视图内部职责。

#### Scenario: Return from conversation detail to the current document list
- **WHEN** 用户已进入某个文档关联会话的详情
- **THEN** 顶部返回按钮 MUST 返回当前文档的关联会话列表
- **AND** 返回后系统 MUST 继续保留当前文档和当前 Agent 的上下文

#### Scenario: Top-level plus button creates a new conversation and stays in detail
- **WHEN** 用户位于某个文档关联会话的详情
- **THEN** 顶部 `+` 按钮 MUST 创建一个新的当前上下文会话并停留在详情态
- **AND** 系统 MUST NOT 因该按钮改变 `NormalChatView` 底部“新建对话”按钮的既有语义

#### Scenario: Show the current conversation title in the panel header
- **WHEN** 右侧 `AgentPane` 处于会话详情态
- **THEN** 外层顶部导航 MUST 显示当前会话标题
- **AND** 该标题 MUST 来自当前活动本地会话，而不是从列表项缓存文本推断
