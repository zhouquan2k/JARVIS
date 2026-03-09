## ADDED Requirements

### Requirement: Storage providers MUST preserve sync metadata across CRUD operations
系统 MUST 保证支持同步的存储实现能够无损保存与读取 `Conversation` 的同步元数据，并在列表与详情读取时维持与本地会话一致的排序和内容完整性。

#### Scenario: Persist conversation with sync metadata
- **WHEN** 存储实现保存一条包含 `dirty`、`deleted` 或 `syncedAt` 状态的会话
- **THEN** 后续读取该会话时 MUST 返回完整同步元数据
- **AND** 会话中的 `messages`、`backendId`、`sourceType` 与 `externalId` MUST 保持不变

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
