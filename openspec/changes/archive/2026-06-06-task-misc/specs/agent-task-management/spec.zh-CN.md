## MODIFIED Requirements

### Requirement: Agent task management MUST support inline task creation and editing
The task tab MUST 允许用户在右侧面板中通过内联编辑器创建和编辑任务。该编辑器 MUST 支持任务标题、备注、日期时间、优先级，以及一个互斥的执行状态字段。

#### Scenario: Create a task inline for the active scope
- **WHEN** the user 从任务 tab 点击新增任务操作
- **THEN** the system MUST 在右侧面板中打开内联任务编辑器
- **AND** 保存后的任务 MUST 立即出现在当前作用域的未完成任务列表中

#### Scenario: Edit an existing task inline
- **WHEN** the user 从任务列表中开始编辑一个现有任务
- **THEN** the system MUST 在任务 tab 中打开内联任务编辑器
- **AND** 保存后 MUST 在不离开右侧面板的前提下更新当前渲染的任务内容

#### Scenario: Set one execution state while editing a task
- **WHEN** the user 编辑任务并选择一个执行状态值
- **THEN** 内联任务编辑器 MUST 持久化且只持久化一个 `doing`、`morning`、`afternoon` 或 `evening` 值
- **AND** 选择新的执行状态值时 MUST 替换旧值，而不是叠加多个状态

## ADDED Requirements

### Requirement: Agent task management MUST display and prioritize execution-state metadata
共享任务列表渲染 MUST 把任务执行状态元信息与文档 / agent 归属元信息分开显示。带有执行状态值的任务 MUST 排在无执行状态任务之前，同时在各自分层内部继续遵循现有的截止时间排序规则。

#### Scenario: Render execution-state metadata separately from scope metadata
- **WHEN** 任务列表渲染一条 `executionState` 已设置的任务
- **THEN** 该任务行 MUST 在 footer 中显示对应的执行状态元信息
- **AND** 该执行状态元信息 MUST 与文档或 agent 归属元信息在视觉上保持区分

#### Scenario: Order execution-state tasks ahead of non-execution-state tasks
- **WHEN** 任务列表同时包含设置了 `executionState` 的任务和未设置 `executionState` 的任务
- **THEN** `executionState` 非空的任务 MUST 排在 `executionState` 为空的任务之前
- **AND** 现有的截止时间排序规则 MUST 继续作用于这两个分层内部
