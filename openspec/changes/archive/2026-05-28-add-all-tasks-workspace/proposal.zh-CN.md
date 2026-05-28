## Why

当前工作区里的任务只能在 Agent 右侧面板中按作用域查看，用户无法在一个统一入口里查看跨文档、跨 Agent 的近期任务计划。我们需要一个一等公民的全局任务工作区，用来集中展示近期任务，同时复用现有任务列表交互，而不是再造一套独立的任务产品。

## What Changes

- 新增一个 `all-tasks` 工作区入口，与现有 Workspace 和 Chat 视图平级。
- 引入全局任务查询语义：当 `documentPath = null` 且 `agentKey = null` 时，表示“查询全部任务”，而不再仅表示未归属任务。
- 扩展任务查询参数，增加 `tag` 过滤条件，使共享任务加载接口能够区分 `today`、`planned`、`all` 等子集。
- 将现有右侧面板任务列表的交互抽取为可复用的任务列表能力，让 Agent 作用域视图和全局任务视图共用创建、编辑、完成、删除等行为。
- 为全局任务工作区增加类似 macOS 提醒事项的左侧快捷过滤栏，至少包含 `Today` 和 `Planned`。
- 将 `planned` 任务视图按日期分组展示，其中 `planned` 定义为 `dueAt` 在当前时刻之后的任务，包含“今天稍后”的任务。

## Capabilities

### New Capabilities
- `all-tasks-workspace`：定义全局任务浏览工作区，包括快捷过滤器和按日期分组的计划任务展示。
- `task-provider-contract`：定义共享任务查询契约，包括全局 `null/null` 语义和基于 tag 的任务过滤。

### Modified Capabilities
- `agent-task-management`：现有任务列表交互需要能够脱离 Agent 右侧面板复用，并在全局视图中支持 `planned` 的按日期分组展示。
- `knowledge-context-provider`：基于上下文的任务访问能力需要在 provider 边界上传递新的全局查询语义和任务查询 tag。

## Impact

- 影响代码：`packages/ui` 中的工作区路由、顶层工作区宿主、任务面板组件及相关测试。
- API 影响：`ITaskProvider.getTasks(...)` 以及 server/desktop/web 的 context-provider facade 都需要支持新的任务查询 tag 和全局 `null/null` 语义。
- 持久化/查询行为影响：任务存储 provider 需要把 `null/null` 解释为全局查询，并在 provider 层稳定实现 `today`、`planned` 的过滤。
- 验证影响：需要覆盖查询语义的 provider/route 测试，以及 all-tasks 路由、快捷过滤器、planned 日期分组的 UI 测试。
