## MODIFIED Requirements

### Requirement: Knowledge workspace MUST provide a default assistant pane that is bound to the active scope agent
知识工作区的右栏 MUST 默认渲染真实的 AI 对话 pane，并将其绑定到当前激活文件或目录解析得到的生效 Agent 上下文，而不是始终以全局固定的通用聊天身份运行。该 pane MUST 继续复用现有聊天视图，但其发送链路 MUST 感知当前作用域 Agent 的名称、目标模型、指令和能力边界，并在第一阶段通过 `AgentRuntime` 驱动 Gemini 原生 Agent 或普通聊天 fallback。对于目录级 Agent 会话列表，系统 MUST 继续以 `conversation.agentKey === 当前 agentKey` 作为唯一归类标准，因此用户在普通对话工作台手动绑定到该 Agent 的本地会话也 MUST 出现在该列表中。

#### Scenario: Render the default assistant pane with the active scope agent
- **WHEN** 宿主进入知识工作区且当前激活节点已经解析出一个生效 Agent
- **THEN** 系统 MUST 在右栏渲染默认的 `AgentPane`
- **AND** 该 pane MUST 继续复用现有聊天视图并通过 `AgentRuntime` 发送当前 Agent 上下文请求，而不是忽略文件树作用域

#### Scenario: Pass workspace context with assistant requests
- **WHEN** 知识工作区右栏 Agent 发送一次请求
- **THEN** 系统 MUST 将当前 `activePath`、`contextProvider` 以及可用的 `activeDocument` 一并传给 `AgentRuntime`
- **AND** 后续文件工具执行 MUST 能使用这组工作区上下文

#### Scenario: Inject the active text document on the first turn only when the provider accepts its MIME type
- **WHEN** 当前选中的知识工作区节点是文本文件，且右栏 Agent 在当前会话首轮发送请求
- **THEN** 系统 MUST 先根据当前模型 provider 声明的可接受 `mimeType` 判断该文档是否可进入请求
- **AND** 仅当 provider 接受该 `mimeType` 时，系统 MUST 将该文档内容作为首轮请求的 primary context 注入模型输入

#### Scenario: Attach the active binary document on the first turn only when the provider accepts its MIME type
- **WHEN** 当前选中的知识工作区节点是 PDF 等二进制文档，且右栏 Agent 在当前会话首轮发送请求
- **THEN** 系统 MUST 先根据当前模型 provider 声明的可接受 `mimeType` 判断该文档是否可进入请求
- **AND** 仅当 provider 接受该 `mimeType` 时，系统 MUST 将该文档作为首轮请求的标准附件加入请求，而不是把 `dataBase64` 当作正文文本注入

#### Scenario: Omit unsupported document content from the model request
- **WHEN** 当前模型 provider 未声明接受当前激活文档的 `mimeType`
- **THEN** 系统 MUST NOT 把该文档正文或附件直接注入模型请求
- **AND** 系统 MUST 继续保留 `activePath`、`contextProvider` 与作用域 Agent 上下文供后续工具使用

#### Scenario: Persist the actual first-turn document input into history
- **WHEN** 首轮请求真实采纳了当前文本文件或二进制文档作为模型输入
- **THEN** 系统 MUST 将该文档作为真实请求的一部分写回当前 user message 的历史记录
- **AND** 该历史记录 MUST 能完整还原该轮真实发送的 prompt 与 attachments，而不区分该文档来自手动上传还是自动采纳

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

#### Scenario: Show manually bound conversations in the agent-scoped list
- **WHEN** 用户在普通对话工作台中将一条本地会话手动绑定到当前目录对应的 Agent key
- **THEN** 该会话 MUST 出现在知识工作区右侧 `AgentPane` 的当前 Agent 会话列表中
- **AND** 系统 MUST NOT 要求该会话必须由知识工作区自动创建或自动绑定后才可见
