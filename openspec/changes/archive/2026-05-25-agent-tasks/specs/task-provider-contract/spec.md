## ADDED Requirements

### Requirement: Task provider contract MUST define a first-class task model
The system MUST define a shared `Task` model that is independent from the `Conversation` model. A task MUST carry title, notes, completion state, due date-time, priority, document scope, project scope, system-managed timestamps, and calendar synchronization state.

#### Scenario: Represent a document-scoped task
- **WHEN** the system creates or returns a task associated with a document
- **THEN** the task MUST carry that document path in `documentPath`
- **AND** the task MUST still remain a `Task` object rather than being embedded in a conversation model

#### Scenario: Represent a project-scoped task
- **WHEN** the system creates or returns a task associated directly with a project/agent scope
- **THEN** the task MUST carry that scope in `agentKey`
- **AND** the task MUST NOT be required to carry a document path at the same time

#### Scenario: Represent calendar synchronization state on a task
- **WHEN** the system creates or returns a task that can participate in calendar synchronization
- **THEN** the task MUST carry calendar synchronization state as part of the shared `Task` object
- **AND** callers MUST NOT need a second mapping object to locate the external event or sync status

### Requirement: Context provider MUST expose task access through a dedicated task provider
The system MUST expose task-domain operations through `IContextProvider.getTaskProvider()` rather than flattening task CRUD methods directly into the general context-provider contract.

#### Scenario: Resolve task operations from the context provider
- **WHEN** workspace UI code needs task operations for the current scope
- **THEN** it MUST obtain them through `IContextProvider.getTaskProvider()`
- **AND** the returned object MUST implement the shared `ITaskProvider` contract

#### Scenario: Keep document and conversation contracts separate from task mutations
- **WHEN** the task contract is added to the workspace context architecture
- **THEN** existing `readDocument`, `writeDocument`, and `getConversations` contracts MUST remain available as separate behaviors
- **AND** task mutation operations MUST NOT be added directly to those non-task contracts

### Requirement: Task provider MUST support CRUD and explicit completion transitions
The shared `ITaskProvider` contract MUST support task querying, task creation, task update, task deletion, and a dedicated explicit completion transition API.

#### Scenario: Complete a task through a dedicated completion API
- **WHEN** caller code needs to mark a task complete or reopen it
- **THEN** it MUST call `setTaskCompleted(taskId, completed)`
- **AND** the contract MUST NOT require callers to simulate completion changes exclusively through generic update semantics

#### Scenario: Query tasks by one active scope
- **WHEN** caller code requests `getTasks(documentPath, agentKey, completed)`
- **THEN** the contract MUST support resolving document-scoped tasks or project-scoped tasks for the active selection
- **AND** callers MUST NOT be forced to use a separate query-object type

### Requirement: Task provider MAY normalize provider-managed task fields
Although task creation and update operations accept `Task` objects, the task provider MUST be allowed to normalize provider-managed fields before persisting or returning the task.

#### Scenario: Normalize system-managed fields during create
- **WHEN** caller code creates a task and omits or provides provisional values for `id`, `createdAt`, `updatedAt`, or `completedAt`
- **THEN** the provider MAY replace those values with normalized provider-managed values
- **AND** the returned task MUST contain the normalized values

#### Scenario: Normalize system-managed fields during update
- **WHEN** caller code updates a task through `updateTask(task)`
- **THEN** the provider MAY recalculate `updatedAt` or `completedAt` according to its persistence rules
- **AND** the returned task MUST reflect the normalized persisted state

### Requirement: Task provider contract MUST allow provider-managed calendar synchronization for timed tasks
The shared task-provider contract MUST support provider-managed synchronization of timed tasks to external calendar services without introducing a separate UI-facing task mutation contract.

#### Scenario: Coordinate timed-task calendar synchronization during create or update
- **WHEN** a provider creates or updates a task that qualifies for calendar synchronization
- **THEN** the provider MAY invoke an internal calendar-sync service during the same task lifecycle
- **AND** the resulting task MUST return updated calendar synchronization state through the same `Task` object

#### Scenario: Preserve task mutations when external sync fails
- **WHEN** a provider-managed calendar synchronization attempt fails during task create or update
- **THEN** the task mutation MUST still be allowed to succeed
- **AND** the returned task MUST contain failure state that reflects the unsuccessful sync attempt
