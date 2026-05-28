## MODIFIED Requirements

### Requirement: Agent task management MUST scope task lists to the current selection only
任务 Tab MUST 在任意时刻只按一个作用域解析任务。当当前选择是文档时，任务 Tab MUST 只显示绑定到该文档的任务；当当前选择是 project/agent-owner 且没有激活文档时，任务 Tab MUST 只显示直接绑定到该 project scope 的任务。同时，同一套任务列表交互模型 MUST 能被非 Agent 的工作区界面复用，而不改变 Agent 任务 Tab 本身的作用域查询规则。

#### Scenario: Show only document tasks for an active document
- **WHEN** 当前工作区选择存在激活文档路径
- **THEN** 任务 Tab MUST 只查询并渲染与该文档路径关联的任务
- **AND** 它 MUST NOT 混入 project 作用域任务或其他文档的任务

#### Scenario: Show only project tasks for an active project scope
- **WHEN** 当前工作区选择是一个 agent-owner/project scope 且没有激活文档
- **THEN** 任务 Tab MUST 只查询并渲染直接关联到该 project scope 的任务
- **AND** 它 MUST NOT 混入同一 project 中的文档级任务

#### Scenario: Reuse the same task-list interactions outside the Agent task tab
- **WHEN** 另一个工作区界面为不同作用域选择复用共享任务列表组件
- **THEN** 共享任务列表交互 MUST 与 Agent 任务 Tab 保持行为一致
- **AND** Agent 任务 Tab MUST 继续保持其“仅当前作用域查询”的行为

