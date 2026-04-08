## ADDED Requirements

### Requirement: Sync storage provider MUST preserve conversation document associations through local-first sync
同步存储实现 MUST 在本地保存、增量 push、远端 pull 和启动补偿过程中完整保留会话级 `documentPaths`，使多端都能基于同一份文档关联元数据展示文档相关会话列表。

#### Scenario: Push and pull document paths without loss
- **WHEN** 本地会话包含一个或多个 `documentPaths`
- **THEN** 同步存储实现 MUST 在 push 到远端后仍能在后续 pull 结果中恢复这些路径
- **AND** 多端读取到的会话 MUST 保持一致的文档关联信息

#### Scenario: Hydrate legacy local conversations that already contain document paths
- **WHEN** 宿主启动 `SyncStorageProvider`，且本地存在尚未同步但已包含 `documentPaths` 的会话
- **THEN** 系统 MUST 将这些字段一并纳入启动补偿 push
- **AND** 同步完成后后续 pull MUST 继续返回这些文档关联信息

#### Scenario: Preserve compatibility for synced conversations without document paths
- **WHEN** 同步存储实现读取或拉取一条未包含 `documentPaths` 的旧会话
- **THEN** 系统 MUST 允许该字段缺省
- **AND** MUST NOT 因字段缺失导致同步失败
