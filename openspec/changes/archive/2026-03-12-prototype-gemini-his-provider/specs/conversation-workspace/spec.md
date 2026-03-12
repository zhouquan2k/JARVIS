## MODIFIED Requirements

### Requirement: Workspace shell MUST provide shared history sidebar for chat workspace
系统 MUST 提供一个高于 `NormalChatView` 与 `CompareChatView` 的共享对话工作台视图容器，用于统一承载左侧会话边栏与右侧内容区域，并在 Web 与 Extension 两个宿主中复用一致的暗色沉浸式布局。该容器 MUST 保持“本地 / 外部”一级切换，并在外部视图下进一步管理具体 provider 选择。

#### Scenario: Render workspace shell in host app
- **WHEN** Web 宿主或扩展宿主进入聊天工作台
- **THEN** 系统 MUST 渲染一个包含可折叠侧边栏和右侧内容区的 workspace 容器
- **AND** 该容器 MUST 负责管理“本地 / 外部”一级来源切换、外部 provider 二级选择以及当前右侧视图的挂载

## ADDED Requirements

### Requirement: External workspace MUST provide secondary provider selection
系统 MUST 在“外部”来源视图中提供二级 provider 选择，至少包含 `ChatGPT`、`Gemini` 与 `外部文件导入` 三个入口。

#### Scenario: Switch external provider within external workspace
- **WHEN** 用户已切换到“外部”来源并选择 `ChatGPT` 或 `Gemini`
- **THEN** 系统 MUST 在不离开当前 workspace 的前提下刷新左侧外部历史列表
- **AND** 右侧预览行为 MUST 继续复用统一的普通聊天预览视图

#### Scenario: Start external file import from external workspace
- **WHEN** 用户在“外部”来源下选择 `外部文件导入`
- **THEN** 系统 MUST 触发文件导入流程而不是请求远端历史列表
- **AND** 导入成功后系统 MUST 切回本地活动会话视图
