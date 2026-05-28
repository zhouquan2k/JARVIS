## ADDED Requirements

### Requirement: All-tasks workspace MUST be a top-level workspace destination
The system MUST expose an `all-tasks` workspace as a top-level destination alongside the existing primary workspace destinations, rather than nesting it under the Agent right panel or conversation history views.

#### Scenario: Open the all-tasks workspace from the top-level switcher
- **WHEN** the user selects the all-tasks destination from the top-level workspace switcher
- **THEN** the system MUST navigate to a dedicated all-tasks workspace view
- **AND** the rendered view MUST NOT require an active Agent or active document selection

### Requirement: All-tasks workspace MUST provide shortcut filters for global task subsets
The all-tasks workspace MUST provide a left-side shortcut pane with at least `today` and `planned` filters that drive the task list shown in the main pane.

#### Scenario: Switch the all-tasks main list by shortcut filter
- **WHEN** the user selects `today` or `planned` from the all-tasks shortcut pane
- **THEN** the system MUST update the main task list to the corresponding global task subset
- **AND** the selected filter state MUST remain visible in the shortcut pane

### Requirement: All-tasks workspace MUST reuse the shared task-list interaction model
The all-tasks workspace MUST reuse the same task list behaviors used by the Agent-scoped task surface, including inline create, inline edit, completion toggling, delete actions, and completed-task collapsing.

#### Scenario: Create or edit a task from the all-tasks workspace
- **WHEN** the user creates or edits a task inside the all-tasks workspace
- **THEN** the system MUST use the same inline task editor behavior as the Agent-scoped task list
- **AND** the updated task MUST appear in the currently active all-tasks filter without leaving the workspace

### Requirement: All-tasks planned view MUST group future tasks by calendar date
The all-tasks `planned` view MUST render tasks in date groups derived from each task's due date. A planned task MUST be any task whose `dueAt` exists and is in the future, including later on the current day.

#### Scenario: Group future tasks under their due-date sections
- **WHEN** the all-tasks workspace renders the `planned` filter with multiple future tasks across one or more dates
- **THEN** the system MUST render those tasks under date-group headings derived from their due dates
- **AND** tasks due later today MUST appear in today's date group rather than being excluded from planned tasks

#### Scenario: Exclude overdue or unscheduled tasks from planned groups
- **WHEN** a task has no `dueAt` value or its `dueAt` is not in the future
- **THEN** the system MUST NOT render that task in the all-tasks `planned` groups

