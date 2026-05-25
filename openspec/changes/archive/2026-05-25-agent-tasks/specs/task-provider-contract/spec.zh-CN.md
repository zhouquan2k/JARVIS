## ADDED Requirements

### Requirement: Task provider contract MUST 定义一等的任务模型
系统 MUST 定义一个独立于 `Conversation` 模型的共享 `Task` 模型。任务 MUST 携带标题、备注、完成状态、截止日期时间、优先级、文档作用域、Project 作用域、系统管理时间戳，以及日历同步状态。

#### Scenario: 表达一个文档级任务
- **WHEN** 系统创建或返回一个绑定到某个文档的任务
- **THEN** 该任务 MUST 通过 `documentPath` 携带该文档路径
- **AND** 该任务 MUST 继续作为 `Task` 对象存在，而不是嵌入 `Conversation` 模型中

#### Scenario: 表达一个 Project 级任务
- **WHEN** 系统创建或返回一个直接绑定到 Project / Agent scope 的任务
- **THEN** 该任务 MUST 通过 `agentKey` 携带该作用域
- **AND** 它 MUST NOT 被要求同时携带文档路径

#### Scenario: 在任务对象上表达日历同步状态
- **WHEN** 系统创建或返回一个可参与日历同步的任务
- **THEN** 该任务 MUST 将日历同步状态作为共享 `Task` 对象的一部分携带
- **AND** 调用方 MUST NOT 需要通过第二个映射对象来定位外部事件或同步状态

### Requirement: Context provider MUST 通过独立 task provider 暴露任务访问能力
系统 MUST 通过 `IContextProvider.getTaskProvider()` 暴露任务域操作，而不是把任务 CRUD 方法直接平铺进通用 context-provider 契约。

#### Scenario: 从 context provider 解析任务操作
- **WHEN** 工作区 UI 代码需要当前作用域的任务操作
- **THEN** 它 MUST 通过 `IContextProvider.getTaskProvider()` 获取这些能力
- **AND** 返回对象 MUST 实现共享的 `ITaskProvider` 契约

#### Scenario: 保持文档与会话契约和任务写入解耦
- **WHEN** 任务契约被加入工作区 context 架构
- **THEN** 现有 `readDocument`、`writeDocument` 和 `getConversations` 契约 MUST 继续作为独立能力存在
- **AND** 任务写入操作 MUST NOT 被直接加入这些非任务契约

### Requirement: Task provider MUST 支持 CRUD 与显式完成状态切换
共享的 `ITaskProvider` 契约 MUST 支持任务查询、任务创建、任务更新、任务删除，以及独立的完成状态切换 API。

#### Scenario: 通过独立完成 API 切换任务完成态
- **WHEN** 调用方需要将任务标记完成或重新打开
- **THEN** 它 MUST 调用 `setTaskCompleted(taskId, completed)`
- **AND** 契约 MUST NOT 要求调用方只能通过通用 update 语义模拟完成状态切换

#### Scenario: 按单一激活作用域查询任务
- **WHEN** 调用方请求 `getTasks(documentPath, agentKey, completed)`
- **THEN** 契约 MUST 支持为当前选择解析文档级任务或 Project 级任务
- **AND** 调用方 MUST NOT 被迫使用单独的 query object 类型

### Requirement: Task provider MAY 规范化由 provider 管理的系统字段
尽管任务创建和更新接口接受 `Task` 对象，task provider 在持久化或返回任务前，MUST 被允许规范化由 provider 管理的系统字段。

#### Scenario: 在创建时规范化系统字段
- **WHEN** 调用方创建任务时省略了 `id`、`createdAt`、`updatedAt`、`completedAt`，或传入的是临时值
- **THEN** provider MAY 用规范化后的 provider 管理值替换这些字段
- **AND** 返回的任务 MUST 包含这些规范化后的值

#### Scenario: 在更新时规范化系统字段
- **WHEN** 调用方通过 `updateTask(task)` 更新一个任务
- **THEN** provider MAY 按自身持久化规则重算 `updatedAt` 或 `completedAt`
- **AND** 返回的任务 MUST 反映规范化后的持久化状态

### Requirement: Task provider contract MUST 允许由 provider 管理带时间任务的日历同步
共享 task-provider 契约 MUST 支持由 provider 管理带时间任务到外部日历服务的同步，而不额外引入一套面向 UI 的任务写入契约。

#### Scenario: 在创建或更新任务时编排带时间任务的日历同步
- **WHEN** provider 创建或更新了一个满足日历同步条件的任务
- **THEN** provider MAY 在同一次任务生命周期中调用内部的日历同步服务
- **AND** 返回的任务 MUST 通过同一个 `Task` 对象暴露更新后的日历同步状态

#### Scenario: 外部同步失败时仍允许任务写入成功
- **WHEN** provider 管理的日历同步在任务创建或更新期间失败
- **THEN** 该任务写入 MUST 仍然允许成功
- **AND** 返回的任务 MUST 包含反映同步失败的状态
