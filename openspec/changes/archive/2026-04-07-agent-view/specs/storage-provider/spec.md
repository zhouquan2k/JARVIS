## ADDED Requirements

### Requirement: Storage providers MUST preserve conversation agent keys across save and load
存储实现 MUST 在保存和读取 `Conversation` 时无损保留可选 `agentKey` 字段，使系统能够在后续按 Agent 聚合本地会话。该字段 MUST 被视为与 `modelSelection`、`sync` 等会话级元数据同等级的持久化字段，而不是只存在于运行时内存中。

#### Scenario: Persist an agent key on a conversation
- **WHEN** 存储实现保存一条包含 `agentKey` 的会话
- **THEN** 后续读取该会话时 MUST 返回相同的 `agentKey`
- **AND** 系统 MUST 不因保存流程丢失该字段

#### Scenario: Preserve compatibility for conversations without agent keys
- **WHEN** 存储实现读取一条旧会话且该会话未包含 `agentKey`
- **THEN** 系统 MUST 允许该字段缺省
- **AND** 旧会话 MUST 继续可以被正常读取和使用

#### Scenario: Persist default effective agent keys the same as real agent keys
- **WHEN** 一条知识工作区会话的 `agentKey` 指向 provider 内部默认兜底 Agent
- **THEN** 存储实现 MUST 像保存真实目录 Agent key 一样保存该字段
- **AND** 后续读取时 MUST 继续返回该 key，而不是清空或特殊处理
