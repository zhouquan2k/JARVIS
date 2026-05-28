## ADDED Requirements

### Requirement: All-tasks workspace MUST be a top-level workspace destination
系统 MUST 将 `all-tasks` 作为顶层工作区入口，与现有一级工作区入口平级暴露，而不是把它嵌套到 Agent 右侧面板或会话历史视图中。

#### Scenario: Open the all-tasks workspace from the top-level switcher
- **WHEN** 用户从顶层工作区切换器选择 all-tasks 入口
- **THEN** 系统 MUST 导航到专门的 all-tasks 工作区视图
- **AND** 渲染该视图时 MUST NOT 依赖当前存在激活的 Agent 或激活文档

### Requirement: All-tasks workspace MUST provide shortcut filters for global task subsets
all-tasks 工作区 MUST 提供左侧快捷过滤栏，至少包含 `today` 和 `planned` 两个过滤器，并据此驱动主任务列表显示对应的全局任务子集。

#### Scenario: Switch the all-tasks main list by shortcut filter
- **WHEN** 用户在 all-tasks 快捷过滤栏中选择 `today` 或 `planned`
- **THEN** 系统 MUST 将主任务列表切换到对应的全局任务子集
- **AND** 当前选中的过滤器状态 MUST 在快捷过滤栏中保持可见

### Requirement: All-tasks workspace MUST reuse the shared task-list interaction model
all-tasks 工作区 MUST 复用与 Agent 作用域任务面板相同的任务列表交互模型，包括内联创建、内联编辑、完成状态切换、删除操作和已完成折叠行为。

#### Scenario: Create or edit a task from the all-tasks workspace
- **WHEN** 用户在 all-tasks 工作区内创建或编辑任务
- **THEN** 系统 MUST 使用与 Agent 作用域任务列表相同的内联任务编辑器行为
- **AND** 更新后的任务 MUST 在不离开当前工作区的情况下出现在当前激活的 all-tasks 过滤视图中

### Requirement: All-tasks planned view MUST group future tasks by calendar date
all-tasks 的 `planned` 视图 MUST 按任务的到期日期对未来任务分组展示。planned 任务 MUST 定义为 `dueAt` 存在且位于未来的任务，其中包含“今天稍后”的任务。

#### Scenario: Group future tasks under their due-date sections
- **WHEN** all-tasks 工作区在 `planned` 过滤下渲染多个分布在一个或多个日期的未来任务
- **THEN** 系统 MUST 按这些任务的 due date 生成日期分组标题并分别渲染
- **AND** 今天稍后的任务 MUST 出现在今天对应的日期分组中，而不是被排除在 planned 之外

#### Scenario: Exclude overdue or unscheduled tasks from planned groups
- **WHEN** 某个任务没有 `dueAt`，或者其 `dueAt` 不在未来
- **THEN** 系统 MUST NOT 在 all-tasks 的 `planned` 分组中渲染该任务

