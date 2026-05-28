## MODIFIED Requirements

### Requirement: Knowledge context provider MUST expose task-provider resolution through the shared context contract
系统 MUST 通过 `IContextProvider.getTaskProvider()` 暴露任务领域操作，而不是把任务 CRUD 方法直接铺平到通用 context-provider 契约中。解析得到的 task provider MUST 在 local、desktop bridge 和 HTTP-backed provider 之间保持一致的查询语义，包括支持全局任务查询和基于 tag 的子集过滤。

#### Scenario: Resolve task operations through a local or remote context provider
- **WHEN** 工作区 UI 代码需要当前作用域的任务操作
- **THEN** 它 MUST 通过 `IContextProvider.getTaskProvider()` 获取这些操作
- **AND** 返回对象 MUST 实现共享的 `ITaskProvider` 契约

#### Scenario: Preserve conversation and document lookup behavior while adding task access
- **WHEN** 任务契约被加入工作区上下文架构
- **THEN** 现有文档、节点和会话访问行为 MUST 继续作为独立能力存在
- **AND** 任务变更操作 MUST NOT 取代或改变这些既有契约

#### Scenario: Forward global task queries and tag filters through provider boundaries
- **WHEN** 调用方通过 filesystem-backed、desktop bridge、database-backed 或 HTTP-backed context provider 请求 `getTasks(null, null, completed, tag)`
- **THEN** provider 链 MUST 保持 null/null 的全局查询语义以及所请求的 tag 过滤
- **AND** 调用方 MUST NOT 需要编写宿主特定的任务查询绕过逻辑

