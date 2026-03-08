## ADDED Requirements

### Requirement: Workspace shell MUST provide shared history sidebar for chat workspace
系统 MUST 提供一个高于 `NormalChatView` 与 `CompareChatView` 的工作台视图容器，用于统一承载左侧历史边栏与右侧内容区域。

#### Scenario: Render workspace shell in extension host
- **WHEN** 扩展宿主进入聊天工作台
- **THEN** 系统 MUST 渲染一个包含可折叠历史边栏和右侧内容区的 workspace 容器
- **AND** 该容器 MUST 负责管理历史来源切换、本地/外部记录选择和当前右侧视图的挂载

### Requirement: Workspace shell MUST preserve normal and compare views as right-pane content
系统 MUST 保留 `NormalChatView` 和 `CompareChatView` 作为右侧内容视图，而不是将历史边栏直接耦合进其中任一业务视图。

#### Scenario: Switch content view by mode
- **WHEN** 用户在扩展宿主中切换普通聊天模式与对比聊天模式
- **THEN** workspace 容器 MUST 在右侧内容区挂载对应的 `NormalChatView` 或 `CompareChatView`
- **AND** 历史边栏 MUST 继续由 workspace 容器统一持有，而不是随右侧视图销毁重建

### Requirement: Normal chat view MUST support external-history preview mode
系统 MUST 允许普通聊天区域进入外部历史预览态，并复用现有消息渲染区域显示标准化后的历史消息。

#### Scenario: Preview external conversation in normal pane
- **WHEN** 用户在历史边栏点击一条外部历史记录
- **THEN** 系统 MUST 在普通聊天区域加载该条记录的标准化 `Conversation`
- **AND** 普通聊天区域 MUST 进入只读预览态，不得允许继续发送消息

### Requirement: Normal chat view MUST inline import action in existing input area
系统 MUST 在 `NormalChatView` 现有底部操作区域内直接渲染导入按钮，以替代发送输入区，而不是依赖独立的导入栏组件。

#### Scenario: Replace input area with inline import action
- **WHEN** 普通聊天区域处于外部历史预览态
- **THEN** 系统 MUST 隐藏原有消息输入框和发送按钮
- **AND** 系统 MUST 在同一区域显示明确的导入操作按钮

### Requirement: Importing previewed history MUST activate local conversation for follow-up
系统 MUST 在用户导入外部历史后，将该对话保存为本地会话并自动切换回活动态，以支持后续继续追问。

#### Scenario: Import previewed conversation and continue chat
- **WHEN** 用户在外部历史预览态点击导入按钮且保存成功
- **THEN** 系统 MUST 将该条标准化 `Conversation` 保存到本地存储
- **AND** 系统 MUST 将当前会话切换为对应的本地活动会话并恢复普通输入区
