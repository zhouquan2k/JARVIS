English | [Chinese](spec.zh-CN.md) ## ADDED Requirements ### Requirement: Storage providers MUST preserve sync metadata across CRUD operations
The system MUST 保证supportsync的存储实现能够无损save与read `Conversation` 的sync元数据，并在list与detailsread时维持与localconversation一致的排序和内容完整性。承载该capability的主interface命名 MUST 收敛为 `IConversationPersistProvider`，而不是continue以泛化的 `IStorageProvider` 作为conversation持久化契约名。 #### Scenario: Persist conversation through the canonical persist contract
- **WHEN** 任一host或sync组件请求save一条conversation
- **THEN** The system MUST 通过 `IConversationPersistProvider.saveConversation(chat)` 执行持久化
- **AND** 后续read该conversation时 MUST continuereturn完整sync元数据与message内容 ### Requirement: Storage providers MUST support soft-delete semantics for sync
当conversation需要参与远端deletesync时，存储实现 MUST support软delete语义，使已deleteconversation在远端确认前仍可被sync引擎感知。 #### Scenario: Delete conversation before remote acknowledgement
- **WHEN** sync存储实现对一条conversation执行delete且远端尚未确认
- **THEN** The system MUST allow该conversation以 `deleted` 状态continue被sync引擎read
- **AND** The system MUST NOT 因立即物理delete而丢失远端delete广播所需的信息 ### Requirement: Storage providers MUST expose local unsynced conversations for startup push
当系统在任意一次启动时需要补偿未sync backlog，底层存储实现 MUST 能让sync引擎read到此前onlysave在local、尚未携带sync元数据的普通conversation与已导入external history，以便执行启动补推。 #### Scenario: List local conversations without sync metadata for startup push
- **WHEN** sync引擎在启动阶段read全部localconversation
- **THEN** 存储实现 MUST return那些缺失 `sync` 元数据但仍属于普通聊天或external history导入的数据
- **AND** sync引擎 MUST 能基于这些记录补写sync状态并continue推送到远端 ### Requirement: Storage providers MUST preserve question index metadata across save and load
存储实现 MUST 在save和readconversation时无损保留message级question索引元数据，包括 `questionId`、`starred`、`deleted` 与 `createdAt`。这些字段 MUST 与既有的body、attachment和注解一起被持久化，而不是只存在于运行时内存中。 #### Scenario: Persist question metadata in conversation messages
- **WHEN** 存储实现save一条包含question索引元数据的conversation
- **THEN** 后续read该conversation时，每条message的 `questionId`、`starred`、`deleted` 与 `createdAt` MUST keep不变
- **AND** The system MUST 不丢失message原有的 `content`、`attachments` 与 `annotations` ### Requirement: Storage providers MUST persist the actual sent message content and attachments
存储实现 MUST 以message的实际发送body与实际发送attachment作为持久化对象，而不是把“原始input”和“实际发送内容”视为两套并存的messagebody语义。对于系统automatically加入且真实enter请求的currentdocument，存储实现 MUST 将其与the user手工attachment一样保留在 `attachments` 中。 #### Scenario: Persist actual prompt text after request preparation
- **WHEN** 系统在发送前对the usermessagebody做了程序侧改写，例如为currenttext文件追加稳定prompt
- **THEN** 存储实现 MUST 持久化改写后的最终body
- **AND** 后续read该message时，`content` MUST 仍然等于这份实际发送body #### Scenario: Persist auto-attached current documents alongside user attachments
- **WHEN** 系统automatically将current工作区document作为attachment加入实际请求
- **THEN** 存储实现 MUST 将该document持久化到对应the usermessage的 `attachments`
- **AND** 后续read该message时，The system MUST 能区分并recovery这份automatically加入但实际发送过的documentattachment ### Requirement: Storage providers MUST keep soft-deleted question pairs recoverable in raw conversation data
存储实现 MUST 将问答对delete视为message级软delete，而不是在save时物理移除message节点。这样系统才能在后续sync、审计或未来的撤销deletecapability中continue访问原始message顺序与内容。 #### Scenario: Save conversation with deleted question pair
- **WHEN** 某个 `questionId` 对应的the userquestion和助手回复被标记为 `deleted = true`
- **THEN** 存储实现 MUST continue保留这两条message在 `Conversation.messages` 中的原始顺序
- **AND** The system MUST 不因save流程而将其从原始conversation结构中直接移除 ### Requirement: Storage providers MUST hard-delete whole conversations removed from sidebar history
存储实现 MUST 将left-sidehistorylist触发的整conversationdelete视为 `Conversation` 级别的硬delete，而不是复用message级软delete语义。调用 `deleteConversation(id)` 后，该conversation MUST 从localconversation集合中物理移除，不再作为隐藏记录continue保留。该delete语义在interfacerename后 MUST keep不变。 #### Scenario: Rename storage interface without changing delete semantics
- **WHEN** 调用方从旧命名迁移到 `IConversationPersistProvider`
- **THEN** `deleteConversation(id)` MUST continue物理delete目标conversation
- **AND** 后续 `getConversation(id)` 与 `getAllConversations()` MUST 不再return该conversation ### Requirement: Storage providers MUST preserve conversation model selection across save and load
存储实现 MUST 在save和read `Conversation` 时无损保留conversation级 `modelSelection`，使普通聊天可以在conversationrecovery后continue沿用此前的 Provider、model和功能选项。 #### Scenario: Persist conversation model selection
- **WHEN** 存储实现save一条包含 `modelSelection.providerId`、`modelSelection.modelId` 与 `modelSelection.modelOptions` 的conversation
- **THEN** 后续read该conversation时 MUST return完整一致的 `modelSelection`
- **AND** The system MUST 不因save流程丢失任何已启用的功能项键值 #### Scenario: Preserve backward compatibility for conversations without model selection
- **WHEN** 存储实现read旧conversation且该conversation未包含 `modelSelection`
- **THEN** The system MUST allow该字段缺省
- **AND** 旧conversation MUST continue作为普通可recoveryconversation被read，而不是因为缺少新字段失败 ### Requirement: Storage providers MUST preserve conversation agent keys across save and load
存储实现 MUST 在save和read `Conversation` 时无损保留可选 `agentKey` 字段，使系统能够在后续按 Agent 聚合localconversation。该字段 MUST 被视为与 `modelSelection`、`sync` 等conversation级元数据同等级的持久化字段，而不是只存在于运行时内存中。 #### Scenario: Persist an agent key on a conversation
- **WHEN** 存储实现save一条包含 `agentKey` 的conversation
- **THEN** 后续read该conversation时 MUST return相同的 `agentKey`
- **AND** The system MUST 不因save流程丢失该字段 #### Scenario: Preserve compatibility for conversations without agent keys
- **WHEN** 存储实现read一条旧conversation且该conversation未包含 `agentKey`
- **THEN** The system MUST allow该字段缺省
- **AND** 旧conversation MUST continue可以被正常read和使用 #### Scenario: Persist default effective agent keys the same as real agent keys
- **WHEN** 一条knowledge workspaceconversation的 `agentKey` 指向 provider 内部default兜底 Agent
- **THEN** 存储实现 MUST 像save真实directory Agent key 一样save该字段
- **AND** 后续read时 MUST continuereturn该 key，而不是清空或特殊处理 ### Requirement: Storage providers MUST preserve conversation document associations across save and load
存储实现 MUST 在save和read `Conversation` 时无损保留可选 `documentPaths` 字段，使系统能够在后续按document聚合conversation。该字段 MUST 被视为与 `agentKey`、`modelSelection`、`sync` 等conversation级元数据同等级的持久化字段，而不是只存在于运行时内存中。 #### Scenario: Persist document paths on a conversation
- **WHEN** 存储实现save一条包含 `documentPaths` 的conversation
- **THEN** 后续read该conversation时 MUST return相同的 `documentPaths`
- **AND** The system MUST 不因save流程丢失其中任一关联路径 #### Scenario: Preserve compatibility for conversations without document paths
- **WHEN** 存储实现read一条旧conversation且该conversation未包含 `documentPaths`
- **THEN** The system MUST allow该字段缺省
- **AND** 旧conversation MUST continue可以被正常read和使用 #### Scenario: Preserve multiple document associations together with other metadata
- **WHEN** 某条conversation同时包含 `agentKey`、`modelSelection` 与多个 `documentPaths`
- **THEN** 存储实现 MUST 一并保留这些字段
- **AND** 后续read时 MUST 不因其他元数据write覆盖掉document关联信息
