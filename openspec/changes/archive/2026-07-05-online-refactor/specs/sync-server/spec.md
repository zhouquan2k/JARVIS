English | [Chinese](spec.zh-CN.md)

## ADDED Requirements

### Requirement: Sync server MUST expose task sync endpoints with an independent cursor
The sync server SHALL provide task push and pull endpoints under the sync namespace (`/api/sync/tasks/push`, `/api/sync/tasks/pull`), scoped by `x-sync-key` like conversation sync, with a task-resource cursor independent from the conversation cursor. Existing conversation endpoints MUST remain unchanged.

#### Scenario: Task pull is incremental and namespaced
- **WHEN** a client pulls tasks with a cursor under a given `syncKey`
- **THEN** the server MUST return only task records for that `syncKey` newer than the cursor plus the next cursor
- **AND** conversation cursors MUST NOT be affected by task sync traffic

#### Scenario: Conversation contract is untouched
- **WHEN** an existing client uses only conversation push/pull
- **THEN** its behavior MUST be identical to before task endpoints existed

### Requirement: Sync server MUST apply last-write-wins and whitelist normalization to tasks
Task pushes SHALL be validated, normalized through an explicit task field whitelist, and merged per task id by `updatedAt` (newer wins). Invalid payloads MUST be rejected without partial writes.

#### Scenario: Stale task push does not overwrite newer record
- **WHEN** a pushed task has an older `updatedAt` than the stored record
- **THEN** the server MUST keep the stored record
- **AND** the push response MUST still succeed for the batch
