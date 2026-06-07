## Why

The current task experience breaks down when users move from reviewing tasks globally to acting on them in workspace context. It also lacks a lightweight execution-state model for surfacing what is actively in progress, making the all-tasks view less useful for day-to-day prioritization.

## What Changes

- Extend the all-tasks workspace so clicking a task can reopen the corresponding workspace node and restore task-related workspace context.
- Change shared task-list editing so all-tasks editing appears inline at the current task row instead of moving the editor to a panel-level location.
- Default new tasks created from the all-tasks `today` shortcut to today's date without forcing a concrete time.
- Add a mutually exclusive task execution-state field with `doing`, `morning`, `afternoon`, and `evening` values.
- Render execution-state metadata separately from document/agent scope metadata and sort tasks with an execution state ahead of tasks without one.
- Introduce a higher-level `WorkspaceNavigationApi.openNode(path, options)` bridge in the workspace UI layer instead of giving `documentWorkspace.openNode()` route-switching semantics.
- Add `Scheduled` and `Backlog` filters to the left panel of the all-tasks workspace, where `Scheduled` means `executionState !== null` and `Backlog` means `dueAt === null && executionState === null`.
- Extend the Markdown editor link-insertion flow so users can upload a new file inside the current flow and insert a link to that newly uploaded file.
- Add a `Refresh current document` action to the Markdown editor that reloads the active file from the filesystem and requires confirmation before discarding unsaved changes.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `all-tasks-workspace`: The global task view must support task-to-workspace navigation, `today`-scoped default date creation, row-stable inline editing, execution-state display, and execution-state-first ordering.
- `agent-task-management`: The shared task editor and task-row interactions must support a persisted execution-state field and inline row editing without a panel-level edit jump.
- `knowledge-workspace`: Workspace navigation must support reopening a target node together with task-related tab/detail restoration through a higher-level navigation bridge.
- `core-interfaces`: The shared `Task` model must carry a persisted execution-state field as part of the cross-host task contract.
- `all-tasks-workspace`: The left shortcut panel must add execution-state and no-date based `Scheduled` / `Backlog` filtered views.
- `knowledge-workspace`: The Markdown editor must support uploading a new file during link insertion and refreshing the current document from disk.

## Impact

- Affected code: `plugins/task-mgr` task list/editor components, `packages/ui` workspace host and navigation bridge, and task persistence/contract layers in `packages/core` and `packages/node`.
- APIs: introduces `WorkspaceNavigationApi.openNode(path, options)` at the workspace UI layer, extends the shared `Task` entity with execution-state data, and adds new task-query tag semantics.
- Persistence/model behavior: stored task records must persist execution-state values without introducing a separate mapping object.
- Validation: requires task component tests, workspace navigation tests, Markdown editor interaction tests, and task persistence/bridge coverage for the new execution-state field and tag semantics.
