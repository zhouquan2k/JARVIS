English | [中文](spec.zh-CN.md)

## ADDED Requirements

### Requirement: Storage providers MUST preserve sync metadata across CRUD operations
系统 MUST 保证支持同步的存储实现能够无损保存与读取 `Conversation` 的同步元数据，并在列表与详情读取时维持与本地会话一致的排序和内容完整性。承载该能力的主接口命名 MUST 收敛为 `IConversationPersistProvider`，而不是继续以泛化的 `IStorageProvider` 作为会话持久化契约名。

#### Scenario: Persist conversation through the canonical persist contract
- **WHEN** 任一宿主或同步组件请求保存一条会话
- **THEN** 系统 MUST 通过 `IConversationPersistProvider.saveConversation(chat)` 执行持久化
- **AND** 后续读取该会话时 MUST 继续返回完整同步元数据与消息内容

### Requirement: Storage providers MUST support soft-delete semantics for sync
当会话需要参与远端删除同步时，存储实现 MUST 支持软删除语义，使已删除会话在远端确认前仍可被同步引擎感知。

#### Scenario: Delete conversation before remote acknowledgement
- **WHEN** 同步存储实现对一条会话执行删除且远端尚未确认
- **THEN** 系统 MUST 允许该会话以 `deleted` 状态继续被同步引擎读取
- **AND** 系统 MUST NOT 因立即物理删除而丢失远端删除广播所需的信息

### Requirement: Storage providers MUST expose local unsynced conversations for startup push
当系统在任意一次启动时需要补偿未同步 backlog，底层存储实现 MUST 能让同步引擎读取到此前仅保存在本地、尚未携带同步元数据的普通会话与已导入外部历史，以便执行启动补推。

#### Scenario: List local conversations without sync metadata for startup push
- **WHEN** 同步引擎在启动阶段读取全部本地会话
- **THEN** 存储实现 MUST 返回那些缺失 `sync` 元数据但仍属于普通聊天或外部历史导入的数据
- **AND** 同步引擎 MUST 能基于这些记录补写同步状态并继续推送到远端

### Requirement: Storage providers MUST preserve question index metadata across save and load
存储实现 MUST 在保存和读取会话时无损保留消息级问题索引元数据，包括 `questionId`、`starred`、`deleted` 与 `createdAt`。这些字段 MUST 与既有的正文、附件和注解一起被持久化，而不是只存在于运行时内存中。

#### Scenario: Persist question metadata in conversation messages
- **WHEN** 存储实现保存一条包含问题索引元数据的会话
- **THEN** 后续读取该会话时，每条消息的 `questionId`、`starred`、`deleted` 与 `createdAt` MUST 保持不变
- **AND** 系统 MUST 不丢失消息原有的 `content`、`attachments` 与 `annotations`

### Requirement: Storage providers MUST persist the actual sent message content and attachments
存储实现 MUST 以消息的实际发送正文与实际发送附件作为持久化对象，而不是把“原始输入”和“实际发送内容”视为两套并存的消息正文语义。对于系统自动加入且真实进入请求的当前文档，存储实现 MUST 将其与用户手工附件一样保留在 `attachments` 中。

#### Scenario: Persist actual prompt text after request preparation
- **WHEN** 系统在发送前对用户消息正文做了程序侧改写，例如为当前文本文件追加稳定提示
- **THEN** 存储实现 MUST 持久化改写后的最终正文
- **AND** 后续读取该消息时，`content` MUST 仍然等于这份实际发送正文

#### Scenario: Persist auto-attached current documents alongside user attachments
- **WHEN** 系统自动将当前工作区文档作为附件加入实际请求
- **THEN** 存储实现 MUST 将该文档持久化到对应用户消息的 `attachments`
- **AND** 后续读取该消息时，系统 MUST 能区分并恢复这份自动加入但实际发送过的文档附件

### Requirement: Storage providers MUST keep soft-deleted question pairs recoverable in raw conversation data
存储实现 MUST 将问答对删除视为消息级软删除，而不是在保存时物理移除消息节点。这样系统才能在后续同步、审计或未来的撤销删除能力中继续访问原始消息顺序与内容。

#### Scenario: Save conversation with deleted question pair
- **WHEN** 某个 `questionId` 对应的用户问题和助手回复被标记为 `deleted = true`
- **THEN** 存储实现 MUST 继续保留这两条消息在 `Conversation.messages` 中的原始顺序
- **AND** 系统 MUST 不因保存流程而将其从原始会话结构中直接移除

### Requirement: Storage providers MUST hard-delete whole conversations removed from sidebar history
存储实现 MUST 将左侧历史列表触发的整会话删除视为 `Conversation` 级别的硬删除，而不是复用消息级软删除语义。调用 `deleteConversation(id)` 后，该会话 MUST 从本地会话集合中物理移除，不再作为隐藏记录继续保留。该删除语义在接口重命名后 MUST 保持不变。

#### Scenario: Rename storage interface without changing delete semantics
- **WHEN** 调用方从旧命名迁移到 `IConversationPersistProvider`
- **THEN** `deleteConversation(id)` MUST 继续物理删除目标会话
- **AND** 后续 `getConversation(id)` 与 `getAllConversations()` MUST 不再返回该会话

### Requirement: Storage providers MUST preserve conversation model selection across save and load
存储实现 MUST 在保存和读取 `Conversation` 时无损保留会话级 `modelSelection`，使普通聊天可以在会话恢复后继续沿用此前的 Provider、模型和功能选项。

#### Scenario: Persist conversation model selection
- **WHEN** 存储实现保存一条包含 `modelSelection.providerId`、`modelSelection.modelId` 与 `modelSelection.modelOptions` 的会话
- **THEN** 后续读取该会话时 MUST 返回完整一致的 `modelSelection`
- **AND** 系统 MUST 不因保存流程丢失任何已启用的功能项键值

#### Scenario: Preserve backward compatibility for conversations without model selection
- **WHEN** 存储实现读取旧会话且该会话未包含 `modelSelection`
- **THEN** 系统 MUST 允许该字段缺省
- **AND** 旧会话 MUST 继续作为普通可恢复会话被读取，而不是因为缺少新字段失败

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
