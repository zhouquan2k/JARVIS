## MODIFIED Requirements

### Requirement: Workspace shell MUST provide shared history sidebar for chat workspace
系统 MUST 提供一个高于 `NormalChatView` 与 `CompareChatView` 的共享对话工作台视图容器，用于统一承载左侧会话边栏、中部聊天内容区域以及普通聊天模式下的右侧问题索引区域，并在 Web 与 Extension 两个宿主中复用一致的暗色沉浸式布局。该容器 MUST 保持“本地 / 外部”一级切换，并在外部视图下进一步管理具体 provider 选择；当右侧内容区处于普通聊天活动态时，工作台 MUST 同步挂载问题索引面板。

#### Scenario: Render workspace shell in host app
- **WHEN** Web 宿主或扩展宿主进入聊天工作台
- **THEN** 系统 MUST 渲染一个包含可折叠侧边栏和右侧内容区的 workspace 容器
- **AND** 该容器 MUST 负责管理“本地 / 外部”一级来源切换、外部 provider 二级选择、当前右侧视图的挂载以及普通聊天问题索引面板的显示状态

## ADDED Requirements

### Requirement: Normal chat workspace MUST integrate question index panel with conversation state
系统 MUST 在普通聊天活动态下将当前会话中的问题索引面板与主线程渲染绑定到同一份会话状态；当工作台切换到外部历史预览态或对比模式时，系统 MUST 隐藏或停用问题索引面板，而不是继续展示过期索引内容。

#### Scenario: Show question index only for active normal chat
- **WHEN** 用户处于普通聊天活动态且当前会话存在至少一条用户问题
- **THEN** 工作台 MUST 渲染该会话的问题索引面板
- **AND** 当用户切换到对比模式或外部预览态时，工作台 MUST 停止展示活动会话的问题索引

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

### Requirement: Aborting generation MUST restore the submitted draft
当普通聊天正在生成助手回复时，系统 MUST 将发送按钮切换为“停止”。用户点击停止后，系统 MUST 中断当前生成流程，并把刚刚提交的用户提示词重新填回输入框，同时自动恢复输入焦点，以便用户继续编辑后重发。

#### Scenario: Stop generation and refill prompt
- **WHEN** 用户在助手流式回复过程中点击“停止”
- **THEN** 系统 MUST 立即中断当前生成请求
- **AND** 系统 MUST 将最近一次已提交的用户提示词回填到输入框并自动聚焦

### Requirement: Local history sidebar MUST provide hover-only conversation deletion
系统 MUST 在左侧本地历史列表中为每条本地会话提供整会话删除入口，但该入口 MUST 仅在条目进入 hover 或键盘 focus 态时显示，以维持紧凑、标题优先的侧边栏视觉。删除入口 MUST 不出现在外部历史预览列表中。

#### Scenario: Reveal delete action only on active history row
- **WHEN** 用户将鼠标悬停到某条本地历史项上，或通过键盘聚焦该条目
- **THEN** 系统 MUST 在该条目的操作区显示“删除”按钮
- **AND** 未处于 hover 或 focus 态的其他历史项 MUST NOT 常驻显示该按钮

#### Scenario: Delete current conversation from sidebar
- **WHEN** 用户在左侧本地历史项上确认删除当前活动会话
- **THEN** 系统 MUST 删除该整条会话并从左侧列表中移除
- **AND** 工作台 MUST 自动切换到剩余最近一条本地会话，若不存在剩余会话则 MUST 创建新的空白会话

#### Scenario: Sidebar delete is unavailable for external preview rows
- **WHEN** 用户切换到外部历史来源列表
- **THEN** 系统 MUST NOT 为这些外部历史项显示本地会话删除按钮
- **AND** 删除入口 MUST 仅作用于本地持久化的会话记录
