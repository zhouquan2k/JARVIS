## Why

The current workspace only exposes scoped task lists inside the Agent right panel, so users cannot review upcoming work across documents and agents from one place. We need a first-class all-tasks workspace that surfaces recent plans globally and reuses the existing task list interaction model instead of introducing a separate task product.

## What Changes

- Add a new `all-tasks` workspace at the same navigation level as the existing Workspace and Chat views.
- Introduce a global task query mode where `documentPath = null` and `agentKey = null` means "query across all tasks", instead of limiting null/null to unowned tasks only.
- Extend task queries with a `tag` filter so shared task-loading APIs can distinguish task subsets such as `today`, `planned`, and `all`.
- Extract the existing right-panel task list behavior into a reusable task-list surface so Agent-scoped and global task views share the same create/edit/complete/delete interactions.
- Add a shortcut-style left pane for the all-tasks workspace with at least `Today` and `Planned` filters, inspired by macOS Reminders.
- Render the `planned` task view grouped by calendar date, with `planned` defined as tasks whose `dueAt` is in the future, including later today.

## Capabilities

### New Capabilities
- `all-tasks-workspace`: A top-level workspace for global task browsing with shortcut filters and grouped planned-task presentation.
- `task-provider-contract`: Shared task query semantics for global null/null scope and tag-based task filtering.

### Modified Capabilities
- `agent-task-management`: Existing task-list interactions must be reusable outside the Agent right panel and support grouped planned-task rendering in the global view.
- `knowledge-context-provider`: Context-backed task access must forward the new global query semantics and task query tag through provider boundaries.

## Impact

- Affected code: `packages/ui` workspace routing, top-level workspace host, task-panel components, and task-list tests.
- APIs: `ITaskProvider.getTasks(...)` and the server/desktop/web context-provider facades must support a new task query tag and global null/null semantics.
- Persistence/query behavior: task storage providers must treat null/null as a global query and apply deterministic provider-side filtering for `today` and `planned`.
- Validation: requires provider/route tests for query semantics and UI tests for all-tasks routing, shortcut filters, and planned-task date grouping.
