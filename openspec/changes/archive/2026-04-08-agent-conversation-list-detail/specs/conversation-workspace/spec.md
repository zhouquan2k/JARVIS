## MODIFIED Requirements

### Requirement: Workspace shell MUST provide shared history sidebar for chat workspace
系统 MUST 提供一个高于 `NormalChatView` 与 `CompareChatView` 的共享对话工作台视图容器，用于统一承载左侧会话边栏、中部聊天内容区域以及普通聊天模式下的右侧问题索引区域，并在 Web 与 Extension 两个宿主中复用一致的暗色沉浸式布局。该容器 MUST 保持“本地 / 外部”一级切换，并在外部视图下进一步管理具体 provider 选择；当右侧内容区处于普通聊天活动态时，工作台 MUST 同步挂载问题索引面板。对于本地历史来源，工作台还 MUST 提供整会话级星标过滤入口，使用户可以在不离开当前 workspace 的前提下切换“全部”与“仅看星标”两种视图。

#### Scenario: Filter local history by starred conversations
- **WHEN** 用户位于左侧本地历史来源并将顶部过滤切换到“仅看星标”
- **THEN** 系统 MUST 只显示被标记为 `starred = true` 的本地会话
- **AND** 切回“全部”后 MUST 恢复显示全部本地会话

### Requirement: Sidebar history list MUST support conversation-level starring for local conversations
系统 MUST 允许用户在左侧本地历史列表中对整条本地会话执行星标或取消星标操作，并让该状态在刷新、重开会话与后续列表筛选中保持一致。该能力 MUST 仅作用于本地会话，不得扩展到外部历史预览列表。

#### Scenario: Toggle star state for a local conversation from the sidebar
- **WHEN** 用户在左侧某条本地会话历史项上点击星标操作
- **THEN** 系统 MUST 切换该会话的整会话星标状态并持久化保存
- **AND** 该会话在侧边栏中 MUST 立即呈现对应的已星标或未星标视觉反馈

#### Scenario: Keep starred state available after reopening the workspace
- **WHEN** 用户为一条本地会话设置了星标并在之后重新打开应用或重新进入对话工作台
- **THEN** 系统 MUST 恢复该会话的星标状态
- **AND** 顶部“仅看星标”过滤 MUST 继续可以基于该持久化状态工作

#### Scenario: Do not expose conversation starring for external history rows
- **WHEN** 用户切换到外部历史来源列表
- **THEN** 系统 MUST NOT 为这些外部历史项显示整会话星标操作
- **AND** 星标过滤入口 MUST 仅影响本地历史列表
