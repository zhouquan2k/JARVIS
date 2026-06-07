## MODIFIED Requirements

### Requirement: All-tasks workspace MUST reuse the shared task-list interaction model
The all-tasks workspace MUST 复用与 Agent 作用域任务视图相同的任务列表交互，包括内联创建、内联编辑、完成切换、删除操作、已完成折叠以及执行状态编辑。用户从 all-tasks 进入编辑态时，编辑器 MUST 保持在当前任务行位置，而不是跳到列表上方的面板级编辑区。

#### Scenario: Create or edit a task from the all-tasks workspace
- **WHEN** the user 在 all-tasks workspace 中创建或编辑任务
- **THEN** the system MUST 使用与 Agent 作用域任务列表相同的内联编辑器行为
- **AND** 更新后的任务 MUST 在当前激活的 all-tasks 过滤子集中显示，而不离开该工作区

#### Scenario: Edit a task at its current row position
- **WHEN** the user 从 all-tasks 列表开始编辑一个现有任务
- **THEN** the system MUST 在该任务当前所在的 row 位置渲染编辑器
- **AND** The system MUST NOT 把编辑界面移动到列表上方的面板级槽位

## ADDED Requirements

### Requirement: All-tasks workspace MUST reopen the corresponding workspace context from a task row
The all-tasks workspace MUST 允许用户通过点击任务行回到对应的 knowledge workspace 节点，并通过 workspace 自身拥有的导航桥接完成跳转。当任务存在 `documentPath` 时，导航目标 MUST 为该文档路径；当任务没有文档路径但存在 `agentKey` 时，导航目标 MUST 为对应的 agent/project owner path。该导航桥接同时 MUST 支持恢复任务相关的 `tab` 与 `detailKey` 状态。

#### Scenario: Open a document-scoped task in workspace context
- **WHEN** the user 点击一条带有 `documentPath` 的 all-tasks 任务
- **THEN** the system MUST 在 knowledge workspace 中重新打开该文档路径
- **AND** The system MUST 能恢复该目标位置上的任务相关 `tab` 与 `detailKey` 上下文

#### Scenario: Open a project-scoped task in workspace context
- **WHEN** the user 点击一条 `documentPath` 为空但 `agentKey` 已设置的 all-tasks 任务
- **THEN** the system MUST 在 knowledge workspace 中重新打开对应的 agent/project owner path
- **AND** The system MUST 能恢复该目标位置上的任务相关 `tab` 与 `detailKey` 上下文

### Requirement: All-tasks today shortcut MUST default new tasks to today's date without forcing time
在 all-tasks 的 `today` 快捷视图中创建新任务时，系统 MUST 用当天日期初始化任务草稿，同时保持具体时间未设置。

#### Scenario: Start a new task from the today shortcut
- **WHEN** the user 正在查看 all-tasks 的 `today` 快捷视图并开始创建任务
- **THEN** 新任务草稿 MUST 默认把日期设置为当前本地日期
- **AND** 在用户主动设置前，草稿 MUST NOT 强制写入具体截止时间
