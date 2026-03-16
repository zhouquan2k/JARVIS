## ADDED Requirements

### Requirement: Question index panel MUST render compact entries for visible user questions
系统 MUST 为当前普通聊天会话提供独立的问题索引面板，并仅基于未软删除的用户问题生成索引项。每个索引项 MUST 展示该问题的第一行文本摘要，并在文本超出时执行单行截断，而不是展示完整正文或助手回复内容。

#### Scenario: Render compact question entries
- **WHEN** 当前活动会话包含多组未删除的用户问题与助手回复
- **THEN** 系统 MUST 在右侧问题索引面板中按会话顺序渲染对应的问题条目
- **AND** 每个条目 MUST 只显示用户问题的第一行摘要

### Requirement: Question index panel MUST support starred-only filtering and star state sync
系统 MUST 支持在问题索引面板中切换“全部”和“仅看星标”两种过滤状态，并让星标状态在索引项与主线程问答对之间保持一致。用户对问题执行星标操作后，系统 MUST 同时更新索引项视觉状态和主线程对应问答对的强调样式。

#### Scenario: Filter starred questions only
- **WHEN** 用户将问题索引面板切换到“仅看星标”
- **THEN** 系统 MUST 只显示 `starred = true` 的问题条目
- **AND** 切回“全部”后 MUST 恢复显示所有未软删除的问题条目

#### Scenario: Toggle star state from question index
- **WHEN** 用户在某个问题条目上点击星标操作
- **THEN** 系统 MUST 更新该问题对应消息的星标状态并持久化保存
- **AND** 主线程中对应的问答对 MUST 同步呈现已星标的视觉反馈

### Requirement: Question index panel MUST soft-delete a question pair with inline confirmation
系统 MUST 在问题条目上提供内联删除确认交互，而不是使用全局模态框。用户确认删除后，系统 MUST 将同一 `questionId` 下的用户问题和助手回复同时标记为软删除，并从索引列表与本地主线程可见内容中过滤该问答对。

#### Scenario: Confirm inline delete for question pair
- **WHEN** 用户在问题条目上触发删除并点击确认
- **THEN** 系统 MUST 将同一 `questionId` 对应的用户消息与助手消息一起标记为 `deleted = true`
- **AND** 该问答对 MUST 从问题索引列表和主线程可见消息中移除

### Requirement: Question index panel MUST synchronize navigation with main thread
系统 MUST 让问题索引面板与主线程保持双向定位联动：点击索引项时主线程 MUST 平滑滚动到对应问答对；用户滚动主线程时，面板 MUST 自动高亮当前视口顶部对应的问题条目。

#### Scenario: Scroll to question from index item
- **WHEN** 用户点击问题索引面板中的某个问题条目
- **THEN** 主线程 MUST 平滑滚动到该问题对应的消息锚点
- **AND** 该条目 MUST 成为当前高亮项

#### Scenario: Highlight active question during thread scrolling
- **WHEN** 用户在主线程中上下滚动浏览长对话
- **THEN** 系统 MUST 根据当前视口最靠上的可见问题更新面板高亮项
- **AND** 不得要求用户手动刷新索引面板状态
