## ADDED Requirements

### Requirement: Task provider contract MUST support global task queries through null scope parameters
共享 `ITaskProvider` 契约 MUST 将 `documentPath = null` 且 `agentKey = null` 解释为“跨全部任务的全局查询”，而不是把该组合限制为一个狭义归属子集。

#### Scenario: Query all tasks globally
- **WHEN** 调用方请求 `getTasks(null, null, completed, tag)`
- **THEN** provider MUST 在全部已持久化任务作用域上解析任务
- **AND** 它 MUST NOT 仅返回那些存储归属字段本身为 null 的任务

### Requirement: Task provider contract MUST support tag-based task subset filtering
共享 `ITaskProvider` 契约 MUST 接受一个任务查询 tag，用于区分至少 `all`、`today`、`planned` 三类任务子集，同时在不同宿主和 provider 之间保持同一查询方法形态。

#### Scenario: Query tasks with the all tag
- **WHEN** 调用方请求 `getTasks(documentPath, agentKey, completed, 'all')`
- **THEN** provider MUST 返回请求作用域内的任务，且不再施加额外的日期子集过滤

#### Scenario: Query tasks with the today tag
- **WHEN** 调用方请求 `getTasks(documentPath, agentKey, completed, 'today')`
- **THEN** provider MUST 只返回 `dueAt` 落在该 provider 运行时本地当前日历日期内的任务

#### Scenario: Query tasks with the planned tag
- **WHEN** 调用方请求 `getTasks(documentPath, agentKey, completed, 'planned')`
- **THEN** provider MUST 只返回 `dueAt` 已设置且位于未来的任务
- **AND** 今天稍后到期的任务 MUST 仍然被视为 planned 任务

