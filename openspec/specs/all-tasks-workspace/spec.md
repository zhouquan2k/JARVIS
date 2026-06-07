## Purpose
Define the dedicated all-tasks workspace as a global task surface with shared task-list behavior, global filters, task-to-workspace navigation, and date-aware task creation defaults.

## Requirements

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
The all-tasks workspace MUST reuse the same task list behaviors used by the Agent-scoped task surface, including inline create, inline edit, completion toggling, delete actions, completed-task collapsing, and execution-state editing. Entering edit mode from the all-tasks workspace MUST keep the editor at the current task row instead of moving it to a panel-level position.

#### Scenario: Create or edit a task from the all-tasks workspace
- **WHEN** the user creates or edits a task inside the all-tasks workspace
- **THEN** the system MUST use the same inline task editor behavior as the Agent-scoped task list
- **AND** the updated task MUST appear in the currently active all-tasks filter without leaving the workspace

#### Scenario: Edit a task at its current row position
- **WHEN** the user starts editing an existing task from the all-tasks list
- **THEN** the system MUST render the editor at that task's current row position
- **AND** it MUST NOT move the editing surface to a panel-level slot above the list

### Requirement: All-tasks planned view MUST group future tasks by calendar date
The all-tasks `planned` view MUST render tasks in date groups derived from each task's due date. A planned task MUST be any task whose `dueAt` exists and is in the future, including later on the current day.

#### Scenario: Group future tasks under their due-date sections
- **WHEN** the all-tasks workspace renders the `planned` filter with multiple future tasks across one or more dates
- **THEN** the system MUST render those tasks under date-group headings derived from their due dates
- **AND** tasks due later today MUST appear in today's date group rather than being excluded from planned tasks

#### Scenario: Exclude overdue or unscheduled tasks from planned groups
- **WHEN** a task has no `dueAt` value or its `dueAt` is not in the future
- **THEN** the system MUST NOT render that task in the all-tasks `planned` groups

### Requirement: All-tasks workspace MUST reopen the corresponding workspace context from a task row
The all-tasks workspace MUST let the user click a task row and reopen the corresponding knowledge-workspace node through a workspace-owned navigation bridge. The navigation request MUST target the task's `documentPath` when present, and MUST target the related agent/project owner path when the task has no document path. The navigation bridge MUST also allow restoring task-related `tab` and `detailKey` state.

#### Scenario: Open a document-scoped task in workspace context
- **WHEN** the user clicks an all-tasks row for a task whose `documentPath` is set
- **THEN** the system MUST reopen the knowledge workspace at that document path
- **AND** it MUST be able to restore task-related `tab` and `detailKey` context for that destination

#### Scenario: Open a project-scoped task in workspace context
- **WHEN** the user clicks an all-tasks row for a task whose `documentPath` is null and whose `agentKey` is set
- **THEN** the system MUST reopen the knowledge workspace at the corresponding agent/project owner path
- **AND** it MUST be able to restore task-related `tab` and `detailKey` context for that destination

### Requirement: All-tasks today shortcut MUST default new tasks to today's date without forcing time
Creating a new task from the all-tasks `today` shortcut MUST initialize the task draft with today's calendar date while leaving the concrete time unset.

#### Scenario: Start a new task from the today shortcut
- **WHEN** the user is viewing the all-tasks `today` shortcut and starts creating a task
- **THEN** the new task draft MUST default its date to the current local day
- **AND** the draft MUST NOT force a concrete due time until the user sets one
