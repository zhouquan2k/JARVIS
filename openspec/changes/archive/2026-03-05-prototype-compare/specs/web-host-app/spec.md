## MODIFIED Requirements

### Requirement: Reuse shared chat UI in web host
Web 宿主 MUST 复用 `packages/ui` 提供的共享聊天视图能力，并提供普通聊天与对比聊天的视图切换入口；宿主不得在 `apps/web` 内重复实现等价的核心对话与对比渲染逻辑。

#### Scenario: Web host routes between normal and compare views
- **WHEN** 用户在 Web 宿主中切换到普通聊天或对比聊天入口
- **THEN** 系统 MUST 分别渲染共享 UI 层提供的 NormalChatView 与 CompareChatView
- **AND** 切换入口 MUST 支持刷新后按当前 URL 或宿主状态恢复对应视图。

### Requirement: Preserve markdown semantics in shared output rendering
Web 宿主 MUST 在普通聊天与对比聊天的“原生输出”区域保持 Markdown 渲染语义，以确保大模型返回的 Markdown 内容可读。

#### Scenario: Web host displays markdown response from provider
- **WHEN** Provider 返回包含 Markdown 语法的回答
- **THEN** Web 宿主 MUST 显示标题、列表、代码块等结构化样式
- **AND** 不得退化为仅纯文本换行展示。
