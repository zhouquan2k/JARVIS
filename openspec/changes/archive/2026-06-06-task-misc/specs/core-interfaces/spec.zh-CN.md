## MODIFIED Requirements

### Requirement: Core interfaces MUST define a first-class task provider contract
The system MUST 定义一个独立于 `Conversation` 模型的共享 `Task` 模型，并且 MUST 通过 `IContextProvider.getTaskProvider()` 暴露任务领域操作，而不是把任务 CRUD 直接摊平到通用 context-provider 契约中。该共享任务契约 MUST 支持任务查询、创建、更新、删除、显式完成状态切换、provider 管理的日历同步状态，以及一个持久化的互斥执行状态字段。

#### Scenario: Represent a document-scoped task
- **WHEN** the system 创建或返回一条与文档关联的任务
- **THEN** 该任务 MUST 在 `documentPath` 中携带对应文档路径
- **AND** 该任务 MUST 继续保持为 `Task` 对象，而不是嵌入到 conversation 模型里

#### Scenario: Represent a project-scoped task
- **WHEN** the system 创建或返回一条直接关联 project/agent scope 的任务
- **THEN** 该任务 MUST 在 `agentKey` 中携带该作用域
- **AND** The system MUST NOT 要求它同时必须携带文档路径

#### Scenario: Represent a task that belongs to both document and project scopes
- **WHEN** the system 创建或返回一条同时关联文档和 project/agent scope 的任务
- **THEN** 该任务 MUST 被允许同时携带 `documentPath` 和 `agentKey`
- **AND** 调用方 MUST NOT 被迫在这两个作用域字段之间二选一

#### Scenario: Represent calendar synchronization state on a task
- **WHEN** the system 创建或返回一条可参与日历同步的任务
- **THEN** 该任务 MUST 直接在共享 `Task` 对象上携带日历同步状态
- **AND** 调用方 MUST NOT 需要第二个映射对象来定位外部事件或同步状态

#### Scenario: Represent execution state on a task
- **WHEN** the system 创建或返回一条会参与日常执行状态展示或排序的任务
- **THEN** 该任务 MUST 直接在共享 `Task` 对象上携带执行状态值
- **AND** 调用方 MUST NOT 需要第二个映射对象来判断该任务是否为 `doing`、`morning`、`afternoon` 或 `evening`

#### Scenario: Resolve task operations from the context provider
- **WHEN** workspace UI code 需要访问当前作用域的任务操作
- **THEN** it MUST 通过 `IContextProvider.getTaskProvider()` 获取这些能力
- **AND** 返回对象 MUST 实现共享 `ITaskProvider` 契约

#### Scenario: Keep document and conversation contracts separate from task mutations
- **WHEN** 任务契约被加入 workspace context 架构
- **THEN** 现有 `readDocument`、`writeDocument` 和 `getConversations` 契约 MUST 继续保持为独立能力
- **AND** 任务变更操作 MUST NOT 被直接加入这些非任务契约中

#### Scenario: Complete a task through a dedicated completion API
- **WHEN** 调用方需要把任务标记完成或重新打开
- **THEN** 它 MUST 调用 `setTaskCompleted(taskId, completed)`
- **AND** 契约 MUST NOT 要求调用方只能通过通用 update 语义来模拟完成状态变化

#### Scenario: Query tasks by one active scope
- **WHEN** 调用方请求 `getTasks(documentPath, agentKey, completed)`
- **THEN** 契约 MUST 支持解析文档作用域任务、project 作用域任务，以及同时属于二者的任务
- **AND** 调用方 MUST NOT 被迫改用单独的 query-object 类型

#### Scenario: Resolve today-tag task queries with overdue unfinished tasks
- **WHEN** 调用方请求 `getTasks(documentPath, agentKey, completed, 'today')`
- **THEN** 契约 MUST 被允许返回今天更早到期但未完成的任务，以及来自更早日期但仍未完成的逾期任务
- **AND** The system MUST NOT 要求调用方再发起第二个 overdue 专用查询

#### Scenario: Normalize system-managed fields during create
- **WHEN** 调用方创建任务时省略或临时提供 `id`、`createdAt`、`updatedAt` 或 `completedAt`
- **THEN** provider MAY 用归一化后的 provider 管理值替换这些字段
- **AND** 返回的任务 MUST 包含归一化后的值

#### Scenario: Normalize system-managed fields during update
- **WHEN** 调用方通过 `updateTask(task)` 更新任务
- **THEN** provider MAY 根据自身持久化规则重新计算 `updatedAt` 或 `completedAt`
- **AND** 返回的任务 MUST 反映最终持久化后的归一化状态

#### Scenario: Coordinate timed-task calendar synchronization during create or update
- **WHEN** provider 在创建或更新一条满足日历同步条件的任务
- **THEN** provider MAY 在同一次任务生命周期中调用内部 calendar-sync service
- **AND** 最终返回的任务 MUST 继续通过同一个 `Task` 对象暴露更新后的日历同步状态

#### Scenario: Synchronize date-only tasks with a default calendar time
- **WHEN** provider 创建或更新一条 `dueAt` 只携带日期级信息的任务
- **THEN** provider MUST 仍然被允许通过 calendar-sync service 同步该任务
- **AND** provider MAY 把外部日历事件时间归一化为确定性的默认值，例如本地时间 09:00

#### Scenario: Preserve task mutations when external sync fails
- **WHEN** provider 管理的日历同步尝试在任务创建或更新期间失败
- **THEN** 该任务变更 MUST 仍然允许成功
- **AND** 返回任务 MUST 包含反映同步失败结果的失败状态
