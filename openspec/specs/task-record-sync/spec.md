English | [Chinese](spec.zh-CN.md)

## Purpose
Define the hub-backed task record sync contract, including persistence, offline replica behavior, migration, conflict handling, and hub-owned calendar side effects.

## Requirements

### Requirement: Tasks MUST be persisted as records in the hub database
The system SHALL store tasks as individual records in the hub SQLite database, keyed by `syncKey` and task id, replacing `tasks.json` as the source of truth. Task truth MUST NOT live inside the Dropbox-synced knowledge root.

#### Scenario: Task write lands in the hub database
- **WHEN** a client creates or updates a task and syncs
- **THEN** the hub MUST persist the task as a record in its database with a monotonically increasing server cursor
- **AND** the hub MUST NOT write task truth into `<knowledgeRoot>/.chatprism/tasks.json`

### Requirement: Clients MUST hold an offline task replica
Each client SHALL keep a local task replica (IndexedDB) that serves all task reads and writes, including while offline. Local writes MUST be marked dirty and pushed when connectivity returns; startup MUST push unsynced local tasks.

#### Scenario: Offline task edit survives reconnect
- **WHEN** a client edits a task while the hub is unreachable
- **THEN** the edit MUST be applied to the local replica immediately and marked dirty
- **AND** the next successful sync MUST push the dirty task to the hub

#### Scenario: Task views read from the replica
- **WHEN** any task view (today, planned, by-document) renders
- **THEN** task data MUST come from the local replica rather than a per-request HTTP call

### Requirement: Task conflicts MUST resolve by last-write-wins per task
Concurrent edits to the same task from different clients SHALL be resolved by comparing `updatedAt` per task id; the newer record wins entirely. Distinct tasks MUST never conflict with each other.

#### Scenario: Two clients edit the same task
- **WHEN** two clients push different versions of the same task id
- **THEN** the hub MUST keep the version with the larger `updatedAt`
- **AND** subsequent pulls on all clients MUST converge to that version

### Requirement: Task payloads MUST pass a whitelist normalizer
The hub SHALL normalize every incoming task through an explicit field whitelist before persistence. Any new persisted task field MUST be added to the normalizer, otherwise it MUST NOT survive a round trip.

#### Scenario: Unknown fields are stripped
- **WHEN** a client pushes a task containing fields outside the whitelist
- **THEN** the hub MUST persist only whitelisted fields
- **AND** the pull result MUST NOT contain the stripped fields

### Requirement: Existing tasks.json MUST be migrated once
On hub startup, if the migration flag is unset, the system SHALL import all tasks from `<knowledgeRoot>/.chatprism/tasks.json` into the hub database exactly once, then set the flag. The legacy file becomes read-only legacy data.

#### Scenario: One-time import on first startup
- **WHEN** the hub starts with an unset task-migration flag and a readable tasks.json
- **THEN** all tasks MUST be imported into the hub database
- **AND** the migration flag MUST be set so subsequent startups skip the import

### Requirement: Google Calendar sync MUST execute at the hub
Calendar synchronization side effects SHALL run on the hub when task changes are accepted, using hub-configured credentials. Clients MUST NOT invoke calendar APIs directly.

#### Scenario: Task with recurrence syncs to calendar from the hub
- **WHEN** the hub accepts a pushed task that requires calendar sync
- **THEN** the hub MUST invoke the calendar sync service with its own credentials
- **AND** the outcome MUST NOT depend on which client pushed the task
