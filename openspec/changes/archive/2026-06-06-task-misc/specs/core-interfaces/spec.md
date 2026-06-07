## MODIFIED Requirements

### Requirement: Core interfaces MUST define a first-class task provider contract
The system MUST define a shared `Task` model that is independent from the `Conversation` model, and MUST expose task-domain operations through `IContextProvider.getTaskProvider()` rather than flattening task CRUD methods directly into the general context-provider contract. The shared task contract MUST support task querying, creation, update, deletion, explicit completion transitions, provider-managed calendar synchronization state, and a persisted mutually exclusive execution-state field.

#### Scenario: Represent a document-scoped task
- **WHEN** the system creates or returns a task associated with a document
- **THEN** the task MUST carry that document path in `documentPath`
- **AND** the task MUST still remain a `Task` object rather than being embedded in a conversation model

#### Scenario: Represent a project-scoped task
- **WHEN** the system creates or returns a task associated directly with a project/agent scope
- **THEN** the task MUST carry that scope in `agentKey`
- **AND** the task MUST NOT be required to carry a document path at the same time

#### Scenario: Represent a task that belongs to both document and project scopes
- **WHEN** the system creates or returns a task associated with both a document and a project/agent scope
- **THEN** the task MUST be allowed to carry both `documentPath` and `agentKey`
- **AND** callers MUST NOT be forced to choose only one of those scope fields

#### Scenario: Represent calendar synchronization state on a task
- **WHEN** the system creates or returns a task that can participate in calendar synchronization
- **THEN** the task MUST carry calendar synchronization state as part of the shared `Task` object
- **AND** callers MUST NOT need a second mapping object to locate the external event or sync status

#### Scenario: Represent execution state on a task
- **WHEN** the system creates or returns a task that participates in daily execution-state ordering or display
- **THEN** the task MUST carry its execution-state value as part of the shared `Task` object
- **AND** callers MUST NOT need a second mapping object to discover whether the task is `doing`, `morning`, `afternoon`, or `evening`

#### Scenario: Resolve task operations from the context provider
- **WHEN** workspace UI code needs task operations for the current scope
- **THEN** it MUST obtain them through `IContextProvider.getTaskProvider()`
- **AND** the returned object MUST implement the shared `ITaskProvider` contract

#### Scenario: Keep document and conversation contracts separate from task mutations
- **WHEN** the task contract is added to the workspace context architecture
- **THEN** existing `readDocument`, `writeDocument`, and `getConversations` contracts MUST remain available as separate behaviors
- **AND** task mutation operations MUST NOT be added directly to those non-task contracts

#### Scenario: Complete a task through a dedicated completion API
- **WHEN** caller code needs to mark a task complete or reopen it
- **THEN** it MUST call `setTaskCompleted(taskId, completed)`
- **AND** the contract MUST NOT require callers to simulate completion changes exclusively through generic update semantics

#### Scenario: Query tasks by one active scope
- **WHEN** caller code requests `getTasks(documentPath, agentKey, completed)`
- **THEN** the contract MUST support resolving document-scoped tasks, project-scoped tasks, or tasks that belong to both scopes for the active selection
- **AND** callers MUST NOT be forced to use a separate query-object type

#### Scenario: Resolve today-tag task queries with overdue unfinished tasks
- **WHEN** caller code requests `getTasks(documentPath, agentKey, completed, 'today')`
- **THEN** the contract MUST be allowed to return unfinished tasks due earlier today and unfinished overdue tasks from prior dates
- **AND** it MUST NOT require callers to issue a second overdue-specific query

#### Scenario: Normalize system-managed fields during create
- **WHEN** caller code creates a task and omits or provides provisional values for `id`, `createdAt`, `updatedAt`, or `completedAt`
- **THEN** the provider MAY replace those values with normalized provider-managed values
- **AND** the returned task MUST contain the normalized values

#### Scenario: Normalize system-managed fields during update
- **WHEN** caller code updates a task through `updateTask(task)`
- **THEN** the provider MAY recalculate `updatedAt` or `completedAt` according to its persistence rules
- **AND** the returned task MUST reflect the normalized persisted state

#### Scenario: Coordinate timed-task calendar synchronization during create or update
- **WHEN** a provider creates or updates a task that qualifies for calendar synchronization
- **THEN** the provider MAY invoke an internal calendar-sync service during the same task lifecycle
- **AND** the resulting task MUST return updated calendar synchronization state through the same `Task` object

#### Scenario: Synchronize date-only tasks with a default calendar time
- **WHEN** a provider creates or updates a task whose `dueAt` carries only a date-level value
- **THEN** the provider MUST still be allowed to synchronize that task through the calendar-sync service
- **AND** the provider MAY normalize the external calendar event time to a deterministic default such as 09:00 local time

#### Scenario: Preserve task mutations when external sync fails
- **WHEN** a provider-managed calendar synchronization attempt fails during task create or update
- **THEN** the task mutation MUST still be allowed to succeed
- **AND** the returned task MUST contain failure state that reflects the unsuccessful sync attempt
