## ADDED Requirements

### Requirement: Storage providers MUST preserve conversation document associations across save and load
存储实现 MUST 在保存和读取 `Conversation` 时无损保留可选 `documentPaths` 字段，使系统能够在后续按文档聚合会话。该字段 MUST 被视为与 `agentKey`、`modelSelection`、`sync` 等会话级元数据同等级的持久化字段，而不是只存在于运行时内存中。

#### Scenario: Persist document paths on a conversation
- **WHEN** 存储实现保存一条包含 `documentPaths` 的会话
- **THEN** 后续读取该会话时 MUST 返回相同的 `documentPaths`
- **AND** 系统 MUST 不因保存流程丢失其中任一关联路径

#### Scenario: Preserve compatibility for conversations without document paths
- **WHEN** 存储实现读取一条旧会话且该会话未包含 `documentPaths`
- **THEN** 系统 MUST 允许该字段缺省
- **AND** 旧会话 MUST 继续可以被正常读取和使用

#### Scenario: Preserve multiple document associations together with other metadata
- **WHEN** 某条会话同时包含 `agentKey`、`modelSelection` 与多个 `documentPaths`
- **THEN** 存储实现 MUST 一并保留这些字段
- **AND** 后续读取时 MUST 不因其他元数据写入覆盖掉文档关联信息
