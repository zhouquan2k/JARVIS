## ADDED Requirements

### Requirement: Conversation workspace MUST expose archive only for agent-bound Markdown documents
对话工作区 MUST 仅在 `NormalChatView` 中暴露归档动作，且只有在工作区处于 agent 模式、当前选中节点就是活动中的可写 Markdown 文档时才允许显示。对于普通聊天模式、compare 模式、外部预览模式、目录选中、非 Markdown 文件或只读文档，系统 MUST NOT 显示该动作。

#### Scenario: Show archive action for the active agent Markdown document
- **WHEN** `chatStore.workspaceMode` 为 `agent`
- **AND** 当前选中节点路径与活动文档路径一致
- **AND** 当前活动文档的 MIME 类型为 `text/markdown`
- **AND** 当前活动文档可写
- **THEN** 系统 MUST 在 `NormalChatView` 中渲染归档动作

#### Scenario: Hide archive action outside eligible archive context
- **WHEN** 工作区不处于 agent 模式，或者当前选中节点不是活动中的可写 Markdown 文档
- **THEN** 系统 MUST NOT 渲染归档动作

### Requirement: Conversation workspace MUST archive without confirmation and preserve chat continuity
当用户在满足条件的 agent 对话中触发归档时，系统 MUST 立即执行归档，而不是进入预览确认步骤。工作区 MUST 保持当前对话视图继续可用，并通过轻量反馈告知结果，而不是切换到专门的归档预览模式。

#### Scenario: Archive runs immediately from the chat action
- **WHEN** 用户在满足条件的 agent 对话中点击归档动作
- **THEN** 系统 MUST 立即启动归档操作
- **AND** 在写入合并结果前，系统 MUST NOT 要求用户进行预览确认

#### Scenario: Preserve current chat view after archive
- **WHEN** 归档成功、无改动或失败
- **THEN** 系统 MUST 保持当前对话视图继续挂载
- **AND** 系统 MUST 在聊天工作区中提供非阻塞的成功、无改动或失败反馈

### Requirement: Conversation workspace MUST display persisted archive state for the current conversation
当归档动作与当前对话相关时，对话工作区 MUST 在聊天 UI 中展示该对话的持久化归档状态，使用户能够区分当前对话是从未归档、已归档且最新，还是已经因新消息而过期。

#### Scenario: Show archived status after a successful archive
- **WHEN** 当前满足条件的 agent 对话已经持久化归档元数据，且在归档快照之后没有新增可见消息
- **THEN** 系统 MUST 在 `NormalChatView` 中显示已归档状态标识

#### Scenario: Show stale status after new turns arrive
- **WHEN** 当前满足条件的 agent 对话已经持久化归档元数据，且之后又新增了可见消息
- **THEN** 系统 MUST 在 `NormalChatView` 中显示过期归档状态标识

#### Scenario: Show unarchived status before the first archive
- **WHEN** 当前满足条件的 agent 对话还没有持久化归档元数据
- **THEN** 系统 MUST 在 `NormalChatView` 中显示未归档状态标识
