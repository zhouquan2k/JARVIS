## Why

当前 Agent 右侧面板只承载会话流程，导致文档级或 Project 级的行动项仍然散落在聊天内容或 Markdown 文档中。我们需要在同一个 Agent 视图里提供轻量任务面板，让用户在不离开文档型工作区的前提下管理、完成和编辑与当前作用域相关的任务。

## What Changes

- 在 Agent 右侧面板中，在现有对话 Tab 旁新增任务 Tab。
- 引入轻量任务管理，任务只归属于当前文档或当前 Project / Agent scope，并且当前视图不做跨作用域聚合。
- 增加任务的增删改、完成状态切换、已完成折叠显示，以及参考 macOS 提醒事项字段与概念的内联编辑体验。
- 为带具体日期时间的任务增加仅限 desktop 宿主的 Google Calendar 同步能力，包括备注原样同步和固定提醒规则。
- 引入独立的 `ITaskProvider` 抽象，并通过 `IContextProvider` 获取，保持任务域与会话/文档契约的隔离。
- 扩展共享 `Task` 模型，增加日历同步状态，并引入 `ITaskCalendarSyncService` 抽象，使任务持久化层未来可以接入更多日历服务而不改变 UI 契约。
- 将 UI 侧的右侧面板容器 `AgentPane` 重命名为 `AgentRightPane`，使其职责更准确地表达为右侧工作区容器。

## Capabilities

### New Capabilities
- `agent-task-management`：定义 Agent 视图任务 Tab、按作用域展示任务、内联编辑、完成闭环以及已完成折叠显示等行为。
- `task-provider-contract`：定义共享的任务领域契约，包括 `Task`、`ITaskProvider` 以及 `IContextProvider.getTaskProvider()`。

### Modified Capabilities
- `agent-task-management`：在原有任务 Tab 生命周期能力之外，增加带时间任务的 Google Calendar 同步规则、提醒规则和失败语义。
- `task-provider-contract`：共享任务契约需要增加日历同步状态，以及由 task provider 编排的带时间任务同步能力。
- `agent-view`：Agent 右侧工作区需要从仅支持会话的面板演进为对话/任务双 Tab 容器。
- `knowledge-context-provider`：工作区上下文访问能力需要在现有文档与会话能力之外，增加任务 provider 的获取能力。

## Impact

- 影响代码：`packages/ui` 中 Agent 右侧面板相关组件与测试，`packages/core` 中上下文/任务契约，以及 desktop/server/各 host 的 context provider 实现。
- API 影响：`Task` 需要增加日历同步元数据；同时引入 `ITaskCalendarSyncService`，但不改变右侧面板 UI 的调用契约。
- 持久化影响：除了区分文档任务与 Project 任务外，还需要为带具体时间的任务持久化 desktop-only 的 Google Calendar 同步状态。
- 外部依赖影响：desktop 宿主需要通过 OAuth 2.0 用户授权和离线访问接入 Google Calendar REST API。
- 验证影响：需要覆盖 provider 契约与 UI 行为的单元测试，以及任务创建、编辑、完成、折叠、作用域切换和带时间任务日历同步的端到端验证。
