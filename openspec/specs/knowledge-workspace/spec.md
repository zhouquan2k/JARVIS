## ADDED Requirements

### Requirement: Knowledge workspace MUST provide a three-pane shell
系统 MUST 提供独立的 `KnowledgeWorkspaceView` 作为知识工作区主视图，并以左侧文件浏览、中间单栏所见即所得 Markdown 编辑、右侧 AI pane 的三栏结构组织界面。该工作区 MUST 独立于现有 `conversation-workspace`，而不是在其内部继续堆叠文件浏览与编辑能力。

#### Scenario: Render knowledge workspace as a separate three-pane view
- **WHEN** 宿主进入知识工作区入口
- **THEN** 系统 MUST 渲染 `KnowledgeWorkspaceView`
- **AND** 该视图 MUST 同时提供左栏、中栏和右栏三个稳定面板

#### Scenario: Resize workspace panes without collapsing the editor flow
- **WHEN** 用户调整知识工作区面板宽度
- **THEN** 系统 MUST 保持三栏布局处于可用状态
- **AND** 中间单栏编辑区 MUST 继续保有可编辑能力

### Requirement: Knowledge workspace MUST support file-tree-driven document navigation
知识工作区 MUST 提供面向知识文件的树形浏览能力，使用户可以展开目录、查看文件节点并从左栏打开目标 Markdown 文档。

#### Scenario: Expand directory nodes in the file tree
- **WHEN** 用户在左侧文件树中展开某个目录节点
- **THEN** 系统 MUST 展示该目录下的子节点
- **AND** 子节点 MUST 保留文件与目录的类型区分

#### Scenario: Open a Markdown document from the file tree
- **WHEN** 用户在左侧文件树中选择一个 Markdown 文件节点
- **THEN** 系统 MUST 将该文件设为当前激活文档
- **AND** 中间所见即所得编辑区 MUST 加载该文档的内容

### Requirement: Knowledge workspace MUST support single-pane WYSIWYG Markdown editing
知识工作区 MUST 允许用户以类似 Obsidian 的单栏所见即所得方式编辑当前激活的 Markdown 文档，并以受控方式管理内容替换、草稿状态与保存链路。该能力 MUST 以 Markdown 作为持久化格式，而 MUST NOT 退化为源码输入框加分栏预览的模式。

#### Scenario: Edit the active Markdown document in a WYSIWYG surface
- **WHEN** 用户在中间所见即所得编辑区修改当前文档内容
- **THEN** 系统 MUST 更新当前文档的草稿状态
- **AND** 系统 MUST 能读取到最新的 Markdown 文本内容

#### Scenario: Render common Markdown structures directly in the editor
- **WHEN** 当前文档包含标题、列表、引用或代码块等常见 Markdown 结构
- **THEN** 系统 MUST 在单栏编辑区中按排版态直接呈现这些结构
- **AND** 用户 MUST 能在该编辑区内直接修改这些结构，而不依赖单独的预览分栏

#### Scenario: Persist Markdown after visual editing
- **WHEN** 用户以所见即所得方式修改当前文档并触发保存
- **THEN** 系统 MUST 将编辑器当前状态序列化为 Markdown 文本
- **AND** 写回结果 MUST 继续兼容底层 Markdown 文档存储链路

#### Scenario: Save the active Markdown document
- **WHEN** 用户触发保存或系统执行受控写回
- **THEN** 系统 MUST 将当前 Markdown 内容写回底层文档提供者
- **AND** 已保存文档 MUST 不再被视为未落盘草稿

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
