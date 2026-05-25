## ADDED Requirements

### Requirement: Agent task management MUST 在 Agent 右侧面板中暴露任务 Tab
系统 MUST 在现有对话 Tab 旁提供一个 `tasks` Tab，并且在选中该 Tab 时，仍然在同一个右侧 panel 中渲染任务管理内容，而不是替换中间文档面板。

#### Scenario: 从对话切换到任务
- **WHEN** 用户打开 Agent 右侧面板并切换到任务 Tab
- **THEN** 系统 MUST 保持当前文档或 Project 选择不变
- **AND** 右侧 panel MUST 在原对话区域渲染任务管理内容

#### Scenario: 保留现有对话面板能力
- **WHEN** 用户再切换回对话 Tab
- **THEN** 系统 MUST 渲染现有对话面板行为
- **AND** 新增任务 Tab MUST NOT 移除对话列表或详情能力

### Requirement: Agent task management MUST 只按当前选择的单一作用域展示任务
任务 Tab MUST 在任一时刻只解析一个作用域的任务。当当前选择是文档时，任务 Tab MUST 只显示绑定到该文档的任务。当当前选择是 Project / Agent owner 且没有激活文档时，任务 Tab MUST 只显示直接绑定到该 Project 作用域的任务。

#### Scenario: 在文档激活时只显示文档任务
- **WHEN** 当前工作区选择包含一个激活文档路径
- **THEN** 任务 Tab MUST 只查询并渲染与该文档路径关联的任务
- **AND** 它 MUST NOT 混入 Project 直属任务或其他文档任务

#### Scenario: 在 Project 激活时只显示 Project 直属任务
- **WHEN** 当前工作区选择是 Agent owner / Project 作用域，且没有激活文档
- **THEN** 任务 Tab MUST 只查询并渲染直接绑定到该 Project 作用域的任务
- **AND** 它 MUST NOT 混入该 Project 下的文档任务

### Requirement: Agent task management MUST 支持内联创建与编辑任务
任务 Tab MUST 允许用户通过右侧 panel 内的内联编辑器创建和编辑任务。该编辑器 MUST 支持任务标题、备注、截止日期时间和优先级字段。

#### Scenario: 在当前作用域内联创建任务
- **WHEN** 用户在任务 Tab 中点击新增任务动作
- **THEN** 系统 MUST 在右侧 panel 内打开一个内联任务编辑区
- **AND** 保存后的任务 MUST 立即出现在当前作用域的未完成任务列表中

#### Scenario: 内联编辑已有任务
- **WHEN** 用户从任务列表中对某个已有任务发起编辑
- **THEN** 系统 MUST 在任务 Tab 内打开内联任务编辑区
- **AND** 保存后 MUST 在不离开右侧 panel 的情况下更新列表中的任务内容

### Requirement: Agent task management MUST 支持显式完成闭环和已完成折叠显示
任务 Tab MUST 支持标记完成、重新打开已完成任务、删除任务，并且 MUST 默认折叠已完成任务区域。

#### Scenario: 将任务移入已完成区域
- **WHEN** 用户将一个未完成任务标记为已完成
- **THEN** 系统 MUST 将该任务从未完成列表中移除
- **AND** 该任务 MUST 进入已完成区域

#### Scenario: 已完成任务默认折叠
- **WHEN** 任务 Tab 渲染时存在一个或多个已完成任务
- **THEN** 已完成区域 MUST 默认处于折叠状态
- **AND** UI MUST 仍然让用户知道存在已完成任务

#### Scenario: 重新打开或删除已完成任务
- **WHEN** 用户展开已完成区域，并对某个任务执行重新打开或删除
- **THEN** 被重新打开的任务 MUST 回到未完成列表，或被删除的任务 MUST 从任务 Tab 中消失
- **AND** 整个操作 MUST 在当前作用域内完成，而不离开当前面板

### Requirement: Agent task management MUST 明确展示带有截止日期时间的任务
当任务配置了截止日期时间时，任务 Tab MUST 在列表中明确展示该日期时间信息。

#### Scenario: 渲染带日期时间元数据的任务
- **WHEN** 任务列表包含一个设置了 `dueAt` 的任务
- **THEN** 对应列表项 MUST 展示该任务的日期时间信息
- **AND** 用户 MUST NOT 需要进入编辑态才能知道该任务有具体时间约束

### Requirement: Agent task management MUST 在 desktop 宿主中将带具体时间的任务同步到 Google Calendar
当 desktop 宿主保存一个带具体日期时间的任务时，系统 MUST 在不增加额外日历专用 UI 流程的前提下，将该任务同步到 Google Calendar。同步事件 MUST 使用任务标题、将任务 `notes` 原样写入事件描述，并应用固定提醒策略。

#### Scenario: 为新建的带时间任务创建 Google Calendar 事件
- **WHEN** desktop 宿主创建了一个 `dueAt` 含有具体日期时间的任务
- **THEN** 系统 MUST 为该任务创建对应的 Google Calendar 事件
- **AND** 事件描述 MUST 包含任务 `notes` 的原始内容，而不是额外的 UI 拼装文本

#### Scenario: 编辑带时间任务后更新已有 Google Calendar 事件
- **WHEN** desktop 宿主编辑了一个已存在同步事件的任务的标题、备注或截止日期时间
- **THEN** 系统 MUST 更新原有 Google Calendar 事件，而不是创建第二个事件
- **AND** 同步后的事件 MUST 反映最新保存的任务值

#### Scenario: 没有具体时间的任务不触发同步
- **WHEN** 某个任务没有 `dueAt`，或只有日期级值而没有具体时间
- **THEN** 系统 MUST NOT 为该任务创建或更新 Google Calendar 事件

### Requirement: Agent task management MUST 为已同步的带时间任务应用确定性的提醒规则
desktop 宿主下的同步任务事件 MUST 严格使用由任务时间推导出的固定提醒策略。

#### Scenario: 当任务早于当天 08:00 时跳过早上提醒
- **WHEN** 一个已同步任务在其到期日的 08:00 之前发生
- **THEN** 该事件提醒 MUST NOT 包含“当天 08:00”这一条提醒

#### Scenario: 去重重合的提醒时间
- **WHEN** 两个配置的提醒时刻最终解析为同一个有效时间点
- **THEN** 同步事件 MUST 只保留这个时间点的一条提醒

### Requirement: Agent task management MUST 在日历同步失败时仍然保留任务保存结果
Google Calendar 同步失败 MUST NOT 阻断任务本身的保存闭环。

#### Scenario: 即使外部日历更新失败也要持久化任务
- **WHEN** desktop 宿主保存任务时，Google Calendar 同步尝试失败
- **THEN** 任务在任务系统中的保存 MUST 仍然成功
- **AND** 该任务 MUST 保留可供后续恢复或排查的失败状态
