## MODIFIED Requirements

### Requirement: Agent task management MUST support inline task creation and editing
The task tab MUST let the user create and edit tasks through an inline editor inside the right panel. The editor MUST support task title, notes, due date-time, priority, and a mutually exclusive execution-state field.

#### Scenario: Create a task inline for the active scope
- **WHEN** the user clicks the add-task action from the task tab
- **THEN** the system MUST open an inline task editor inside the right panel
- **AND** a saved task MUST appear immediately in the current uncompleted task list for the active scope

#### Scenario: Edit an existing task inline
- **WHEN** the user starts editing an existing task from the task list
- **THEN** the system MUST open an inline task editor in the task tab
- **AND** saving changes MUST update the rendered task content without leaving the right panel

#### Scenario: Set one execution state while editing a task
- **WHEN** the user edits a task and chooses an execution-state value
- **THEN** the inline task editor MUST persist exactly one of `doing`, `morning`, `afternoon`, or `evening`
- **AND** choosing a new execution-state value MUST replace the previous one instead of combining multiple values

## ADDED Requirements

### Requirement: Agent task management MUST display and prioritize execution-state metadata
Shared task-list rendering MUST display task execution-state metadata distinctly from document/agent scope metadata. Tasks that have an execution-state value MUST be ordered before tasks that do not, while preserving the existing due-date ordering rules inside each tier.

#### Scenario: Render execution-state metadata separately from scope metadata
- **WHEN** the task list renders a task whose `executionState` is set
- **THEN** the row MUST show that execution-state metadata in the task footer
- **AND** the execution-state metadata MUST remain visually distinct from document or agent scope metadata

#### Scenario: Order execution-state tasks ahead of non-execution-state tasks
- **WHEN** the task list contains both tasks with and without an `executionState`
- **THEN** tasks whose `executionState` is set MUST appear before tasks whose `executionState` is null
- **AND** the existing due-date ordering rules MUST still apply within each of those two groups
