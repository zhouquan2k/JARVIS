## MODIFIED Requirements

### Requirement: Workspace shell MUST provide shared history sidebar for chat workspace
系统 MUST 提供一个高于 `NormalChatView` 与 `CompareChatView` 的共享对话工作台视图容器，用于统一承载左侧会话边栏、中部聊天内容区域以及普通聊天模式下的右侧问题索引区域，并在 Web 与 Extension 两个宿主中复用一致的暗色沉浸式布局。该容器 MUST 保持“本地 / 外部”一级切换，并在外部视图下进一步管理具体 provider 选择；当右侧内容区处于普通聊天活动态时，工作台 MUST 同步挂载问题索引面板。对于本地历史来源，工作台还 MUST 提供整会话级星标过滤入口，使用户可以在不离开当前 workspace 的前提下切换“全部”与“仅看星标”两种视图。该工作台在 `chatStore.workspaceMode === 'active'` 时 MUST 继续作为 Agent 主视图的辅助展示层，而在切换到对话模式时 MUST 仅改变展示方式，不得清空当前会话或重置已保存的 Agent 恢复点。

#### Scenario: Render workspace shell in host app
- **WHEN** Web 宿主或扩展宿主进入聊天工作台
- **THEN** 系统 MUST 渲染一个包含可折叠侧边栏和右侧内容区的 workspace 容器
- **AND** 该容器 MUST 负责管理“本地 / 外部”一级来源切换、外部 provider 二级选择、当前右侧视图的挂载以及普通聊天问题索引面板的显示状态

#### Scenario: Treat chat mode as an auxiliary view of the active Agent conversation
- **WHEN** 用户从 Agent 模式切换到对话模式
- **THEN** 系统 MUST 继续展示当前 `currentConversation` 的详情视图
- **AND** 系统 MUST NOT 清空当前会话或重置 Agent 恢复状态

### Requirement: Normal chat view MUST support external-history preview mode
系统 MUST 允许普通聊天区域进入外部历史预览态，并复用现有消息渲染区域显示标准化后的历史消息、附件与注解内容。

#### Scenario: Preview external conversation in normal pane
- **WHEN** 用户在侧边栏点击一条外部历史记录
- **THEN** 系统 MUST 在普通聊天区域加载该条记录的标准化 `Conversation`
- **AND** 普通聊天区域 MUST 进入只读预览态，不得允许继续发送消息

### Requirement: Normal chat view MUST inline import action in existing input area
系统 MUST 在 `NormalChatView` 现有底部操作区域内直接渲染导入按钮或返回按钮，以替代发送输入区，而不是依赖独立的导入栏组件。

#### Scenario: Replace input area with inline import action
- **WHEN** 普通聊天区域处于外部历史预览态
- **THEN** 系统 MUST 隐藏原有消息输入框、附件入口和发送按钮
- **AND** 系统 MUST 在同一区域显示明确的返回与导入操作

### Requirement: Normal chat input MUST follow desktop composition shortcuts
系统 MUST 将普通聊天输入区实现为标准桌面文本编辑交互：按下 `Enter` 时仅执行换行，按下 `Ctrl + Enter` 或 `Cmd + Enter` 时才发送当前草稿。系统 MUST 在输入区域提供可见的快捷键提示，明确告知换行和发送规则。

#### Scenario: Insert newline with bare Enter
- **WHEN** 用户在普通聊天输入框中按下 `Enter` 且未同时按下 `Ctrl` 或 `Meta`
- **THEN** 系统 MUST 在输入框中插入换行
- **AND** 系统 MUST NOT 立即发送消息

#### Scenario: Send message with modifier shortcut
- **WHEN** 用户在普通聊天输入框中按下 `Ctrl + Enter` 或 `Cmd + Enter`
- **THEN** 系统 MUST 发送当前草稿消息
- **AND** 输入区域 MUST 继续保留快捷键提示文案

### Requirement: Sidebar history list MUST remain compact and title-first
系统 MUST 以紧凑、标题优先的方式展示会话列表，避免冗余元信息干扰阅读。

#### Scenario: Render compact history row
- **WHEN** 系统在侧边栏渲染会话历史项
- **THEN** 每一项 MUST 以标题为主内容，并使用单行省略策略
- **AND** 系统 MUST NOT 在历史项默认展示“本地”或日期等辅助文本

### Requirement: Workspace shell MUST preserve the active conversation when switching views
系统 MUST 在 Agent 模式与对话模式之间共享同一份 `currentConversation`，并把对话模式视为当前会话的另一种展示方式，而不是独立会话空间。进入对话模式时，系统 MUST 自动折叠左侧历史列表；返回 Agent 模式时，系统 MUST 恢复进入对话模式前保存的 Agent 视图状态，而不是采用对话模式中临时切换过的节点或会话状态。

#### Scenario: Save the Agent view state before entering chat mode
- **WHEN** 用户从 Agent 模式切换到对话模式
- **THEN** 系统 MUST 保存当前选中节点、活动路径和当前会话标识
- **AND** 该保存结果 MUST 作为返回 Agent 模式时的恢复点

#### Scenario: Collapse the sidebar when entering chat mode
- **WHEN** 用户从 Agent 模式切换到对话模式
- **THEN** 系统 MUST 自动折叠左侧历史列表面板
- **AND** 用户后续仍然 MUST 可以手动展开该面板

#### Scenario: Restore the saved Agent view state when returning from chat mode
- **WHEN** 用户从对话模式切回 Agent 模式
- **THEN** 系统 MUST 按保存的视图状态恢复选中节点、活动路径和当前会话详情
- **AND** 若保存状态失效，系统 MUST 回退到可用的父节点或根节点

### Requirement: Workspace shell MUST preserve normal and compare views as right-pane content
系统 MUST 保留 `NormalChatView` 和 `CompareChatView` 作为右侧内容视图，而不是将侧边栏、主题状态和富消息渲染逻辑直接耦合进其中任一业务视图。

#### Scenario: Switch content view by mode
- **WHEN** 用户在聊天工作台中切换普通聊天模式与对比聊天模式
- **THEN** workspace 容器 MUST 在右侧内容区挂载对应的 `NormalChatView` 或 `CompareChatView`
- **AND** 侧边栏与工作台级主题状态 MUST 继续由 workspace 容器统一持有，而不是随右侧视图销毁重建
