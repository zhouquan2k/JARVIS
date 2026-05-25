## ADDED Requirements

### Requirement: Agent task management MUST expose a task tab in the Agent right panel
The system MUST expose a `tasks` tab alongside the existing conversation tab in the Agent right-side workspace. Selecting the task tab MUST render task-management content in the same right panel without replacing the middle document pane.

#### Scenario: Switch from conversations to tasks
- **WHEN** the user opens the Agent right panel and selects the task tab
- **THEN** the system MUST keep the current document or project selection unchanged
- **AND** the right panel MUST render task-management content in place of the conversation content

#### Scenario: Preserve the existing conversation surface
- **WHEN** the user switches back to the conversation tab
- **THEN** the system MUST render the existing conversation panel behavior
- **AND** adding the task tab MUST NOT remove conversation list or detail capabilities

### Requirement: Agent task management MUST scope task lists to the current selection only
The task tab MUST resolve tasks from exactly one scope at a time. When the current selection is a document, the task tab MUST show only tasks bound to that document. When the current selection is a project/agent-owner scope with no active document, the task tab MUST show only tasks bound directly to that project scope.

#### Scenario: Show only document tasks for an active document
- **WHEN** the current workspace selection has an active document path
- **THEN** the task tab MUST query and render only tasks associated with that document path
- **AND** it MUST NOT mix in project-scoped tasks or tasks from other documents

#### Scenario: Show only project tasks for an active project scope
- **WHEN** the current workspace selection is an agent-owner/project scope and no document is active
- **THEN** the task tab MUST query and render only tasks associated directly with that project scope
- **AND** it MUST NOT mix in document-scoped tasks from the same project

### Requirement: Agent task management MUST support inline task creation and editing
The task tab MUST let the user create and edit tasks through an inline editor inside the right panel. The editor MUST support task title, notes, due date-time, and priority fields.

#### Scenario: Create a task inline for the active scope
- **WHEN** the user clicks the add-task action from the task tab
- **THEN** the system MUST open an inline task editor inside the right panel
- **AND** a saved task MUST appear immediately in the current uncompleted task list for the active scope

#### Scenario: Edit an existing task inline
- **WHEN** the user starts editing an existing task from the task list
- **THEN** the system MUST open an inline task editor in the task tab
- **AND** saving changes MUST update the rendered task content without leaving the right panel

### Requirement: Agent task management MUST support explicit completion lifecycle and completed-task collapse
The task tab MUST support marking tasks complete, reopening completed tasks, deleting tasks, and collapsing completed tasks by default.

#### Scenario: Move a task into the completed section
- **WHEN** the user marks an uncompleted task as completed
- **THEN** the system MUST remove that task from the active uncompleted list
- **AND** the task MUST become available in the completed section

#### Scenario: Completed tasks remain collapsed by default
- **WHEN** the task tab renders with one or more completed tasks
- **THEN** the completed section MUST be collapsed by default
- **AND** the UI MUST still indicate that completed tasks exist

#### Scenario: Reopen or delete a completed task
- **WHEN** the user expands the completed section and reopens or deletes a task
- **THEN** the reopened task MUST return to the uncompleted list or the deleted task MUST disappear from the task tab
- **AND** the operation MUST take effect without leaving the current scope

### Requirement: Agent task management MUST visibly distinguish tasks with due date-time
The task tab MUST visibly display due date-time information for tasks that have one configured.

#### Scenario: Render a task with due date-time metadata
- **WHEN** the task list includes a task whose `dueAt` value is set
- **THEN** the rendered list row MUST show date-time information for that task
- **AND** the user MUST NOT need to enter edit mode to know that the task has a concrete time

### Requirement: Agent task management MUST synchronize timed tasks to Google Calendar on desktop
When the desktop host saves a task that has a concrete date-time, the system MUST synchronize that task to Google Calendar without adding a separate calendar-specific UI flow. The synchronized event MUST use the task title, copy the raw task notes into the event description, and apply the fixed reminder policy.

#### Scenario: Create a Google Calendar event for a new timed task
- **WHEN** the desktop host creates a task whose `dueAt` contains a concrete date-time
- **THEN** the system MUST create a corresponding Google Calendar event for that task
- **AND** the event description MUST contain the task `notes` content without additional UI-authored transformation

#### Scenario: Update an existing Google Calendar event after editing a timed task
- **WHEN** the desktop host edits the title, notes, or due date-time of a task that already has a synchronized calendar event
- **THEN** the system MUST update the existing Google Calendar event rather than creating a second event
- **AND** the synchronized event MUST reflect the latest saved task values

#### Scenario: Do not synchronize tasks that do not have a concrete time
- **WHEN** a task has no `dueAt` value or only a date-level value without a concrete time
- **THEN** the system MUST NOT create or update a Google Calendar event for that task

### Requirement: Agent task management MUST apply deterministic reminder rules for synchronized timed tasks
Synchronized desktop task events MUST use exactly the configured reminder policy derived from the task time.

#### Scenario: Skip the same-day 8:00 reminder when the task is earlier
- **WHEN** a synchronized task is scheduled earlier than 08:00 on its due date
- **THEN** the event reminders MUST NOT include the same-day 08:00 reminder

#### Scenario: Deduplicate overlapping reminders
- **WHEN** two configured reminder instants resolve to the same effective time
- **THEN** the synchronized event MUST keep only one reminder for that instant

### Requirement: Agent task management MUST preserve task saves when calendar synchronization fails
Google Calendar synchronization failures MUST NOT block the task lifecycle itself.

#### Scenario: Persist a task even if the external calendar update fails
- **WHEN** the desktop host saves a task and the Google Calendar synchronization attempt fails
- **THEN** the task save MUST still succeed in the task system
- **AND** the task MUST retain failure state that allows later recovery or diagnosis
