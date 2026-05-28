## ADDED Requirements

### Requirement: Task provider contract MUST support global task queries through null scope parameters
The shared `ITaskProvider` contract MUST treat `documentPath = null` and `agentKey = null` as a global query across all tasks, rather than limiting that combination to a narrow ownership subset.

#### Scenario: Query all tasks globally
- **WHEN** caller code requests `getTasks(null, null, completed, tag)`
- **THEN** the provider MUST resolve tasks across all persisted task scopes
- **AND** it MUST NOT restrict the result to only tasks whose stored ownership fields are null

### Requirement: Task provider contract MUST support tag-based task subset filtering
The shared `ITaskProvider` contract MUST accept a task query tag that distinguishes at least `all`, `today`, and `planned` subsets while keeping the same query method shape across hosts and providers.

#### Scenario: Query tasks with the all tag
- **WHEN** caller code requests `getTasks(documentPath, agentKey, completed, 'all')`
- **THEN** the provider MUST return tasks for the requested scope without applying an additional date-subset filter

#### Scenario: Query tasks with the today tag
- **WHEN** caller code requests `getTasks(documentPath, agentKey, completed, 'today')`
- **THEN** the provider MUST return only tasks whose `dueAt` falls on the current local calendar day for that provider runtime

#### Scenario: Query tasks with the planned tag
- **WHEN** caller code requests `getTasks(documentPath, agentKey, completed, 'planned')`
- **THEN** the provider MUST return only tasks whose `dueAt` is set and lies in the future
- **AND** tasks due later on the current day MUST still qualify as planned tasks

