[English](spec.md) | 中文

## ADDED Requirements

### Requirement: Sync server MUST 提供独立游标的任务同步端点
sync server SHALL 在 sync 命名空间下提供任务 push/pull 端点(`/api/sync/tasks/push`、`/api/sync/tasks/pull`),与会话同步一样按 `x-sync-key` 隔离,任务资源游标与会话游标相互独立。既有会话端点 MUST 保持不变。

#### Scenario: 任务 pull 是增量且按命名空间隔离的
- **WHEN** 客户端在某 `syncKey` 下携带游标 pull 任务
- **THEN** 服务端 MUST 只返回该 `syncKey` 下比游标新的任务记录及下一游标
- **AND** 会话游标 MUST NOT 受任务同步流量影响

#### Scenario: 会话契约不受影响
- **WHEN** 既有客户端只使用会话 push/pull
- **THEN** 其行为 MUST 与任务端点存在之前完全一致

### Requirement: Sync server MUST 对任务应用 LWW 与白名单规范化
任务推送 SHALL 经校验、显式任务字段白名单规范化,并按任务 id 依 `updatedAt` 合并(新者胜)。无效载荷 MUST 被拒绝且不产生部分写入。

#### Scenario: 陈旧任务推送不覆盖较新记录
- **WHEN** 推送任务的 `updatedAt` 比已存记录旧
- **THEN** 服务端 MUST 保留已存记录
- **AND** 该批次 push 响应 MUST 仍然成功
