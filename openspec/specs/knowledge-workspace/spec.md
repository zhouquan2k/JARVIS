## MODIFIED Requirements

### Requirement: Knowledge workspace MUST provide a default assistant pane that is bound to the active scope agent
知识工作区的右栏 MUST 默认渲染真实的 AI 对话 pane，并将其绑定到当前激活文件或目录解析得到的生效 Agent 上下文，而不是始终以全局固定的通用聊天身份运行。该 pane MUST 继续复用现有聊天视图，但其发送链路 MUST 感知当前作用域 Agent 的名称、目标模型、指令和能力边界，并在第一阶段通过 `AgentRuntime` 驱动 Gemini 原生 Agent 或普通聊天 fallback。

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

## ADDED Requirements

### Requirement: Knowledge workspace MUST surface file changes with line-level undo and redo
知识工作区 MUST 为文件修订结果提供 diff 展示与行级 undo/redo 入口，以支持用户理解和回退 Agent 写盘后的变更。

#### Scenario: Show the latest file change as a line diff
- **WHEN** 某个文件修订工具成功修改当前工作区文件
- **THEN** UI MUST 能根据修改前后文本展示 line diff
- **AND** 该 diff MUST 不依赖 LLM 预先生成补丁数据

#### Scenario: Trigger undo or redo from the workspace UI
- **WHEN** 用户在工作区中触发文件 undo 或 redo
- **THEN** 系统 MUST 通过程序侧文件变更服务写回对应内容
- **AND** 写回后再次读取该文件时 MUST 能得到更新后的文本

### Requirement: Knowledge workspace MUST resolve the main pane by document viewer
知识工作区 MUST 先读取当前文档，再根据 `mimeType` 通过统一的 `DocumentViewer` registry 解析主显示区行为，而不是继续在 store 或组件里按扩展名硬编码 `.md` / `.pdf` 分支。

#### Scenario: Resolve markdown and plain text with the same text viewer
- **WHEN** 当前激活文档的 `mimeType` 为 `text/markdown` 或 `text/plain`
- **THEN** 系统 MUST 使用同一个支持编辑的文本 viewer 打开该文档
- **AND** 该 viewer MUST 继续复用现有文本编辑、自动保存、diff 和 undo/redo 链路

#### Scenario: Resolve PDF with a read-only viewer
- **WHEN** 当前激活文档的 `mimeType` 为 `application/pdf`
- **THEN** 系统 MUST 切换到 PDF viewer
- **AND** 该 viewer MUST 只读显示该文档，而不是尝试挂载文本编辑器

#### Scenario: Fall back when no viewer matches the MIME type
- **WHEN** 当前激活文档的 `mimeType` 未命中任何已注册 viewer
- **THEN** 系统 MUST 显示明确的“不支持此文档类型”状态
- **AND** 系统 MUST NOT 退化为盲目使用 Markdown 编辑器

### Requirement: Knowledge workspace MUST provide inline file tree operations
知识工作区左侧文件树 MUST 支持直接面向当前树节点的文件操作，而不是依赖浏览器原生 `prompt/confirm` 或隐式刷新。该交互 MUST 支持树内原位新建、显式刷新、带确认的删除和双击改名。

#### Scenario: Create a file or directory inline inside the tree
- **WHEN** 用户点击文件树中的“新建文件”或“新建目录”
- **THEN** 系统 MUST 在目标父目录下插入一个临时树节点并直接进入原位编辑
- **AND** 用户 MUST 能通过 `Enter` 提交、`Escape` 取消，且空输入失焦 MUST 取消该创建

#### Scenario: Resolve the parent directory for inline creation from the current selection
- **WHEN** 用户从文件树触发新建操作
- **THEN** 若当前选中节点是目录，系统 MUST 将新节点创建到该目录下
- **AND** 若当前选中节点是文件，系统 MUST 将新节点创建到该文件的父目录下
- **AND** 若当前选中根节点 `/`，系统 MUST 将新节点创建到工作区根目录

#### Scenario: Refresh the file tree explicitly
- **WHEN** 用户点击文件树中的刷新按钮
- **THEN** 系统 MUST 重新加载当前工作区目录树
- **AND** 刷新后 MUST 尽量保留仍然存在的展开状态与选中状态

#### Scenario: Delete a selected node only after explicit confirmation
- **WHEN** 用户请求删除当前选中的文件或目录
- **THEN** 系统 MUST 先显示明确的二次确认
- **AND** 目录删除确认 MUST 明确提示会递归删除其内容
- **AND** 只有在用户显式确认后，系统才能执行真实删除

#### Scenario: Fall back to the parent scope after deleting the active node
- **WHEN** 用户删除当前激活文件，或删除包含当前激活文件的目录
- **THEN** 系统 MUST 清空失效的文档编辑状态与文件变更状态
- **AND** 文件树选中 MUST 回退到被删节点的父目录；若父目录不可用，则回退到根节点 `/`

#### Scenario: Rename a file tree node by double click
- **WHEN** 用户双击一个非根节点的文件或目录
- **THEN** 系统 MUST 将该节点切换为原位编辑态，并以当前节点名称作为初始值
- **AND** 用户 MUST 能通过 `Enter` 提交改名、`Escape` 取消改名

#### Scenario: Keep the active workspace path in sync after rename
- **WHEN** 用户重命名当前激活文件，或重命名包含当前激活文件的父目录
- **THEN** 系统 MUST 将 `selectedNodePath`、`activePath` 以及活动文档路径同步到新路径
- **AND** 后续 `AgentPane` 与工作区上下文解析 MUST 基于重命名后的新路径继续工作

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
