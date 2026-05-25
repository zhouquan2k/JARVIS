## Why

The current Agent right panel only exposes conversation workflows, so document- and project-scoped action items remain buried in chat or markdown content. We need a lightweight task surface in the same Agent view so users can track, complete, and edit scoped work items without leaving the document-centric workspace.

## What Changes

- Add a task tab to the Agent right panel alongside the existing conversation tab.
- Introduce lightweight task management scoped to either the active document or the active project/agent scope, without cross-scope aggregation in the same view.
- Add task CRUD, completion toggling, completed-task collapsing, and inline editing behavior inspired by macOS Reminders fields and concepts.
- Add desktop-only Google Calendar synchronization for tasks that have a concrete date-time, including raw note sync and fixed reminder rules.
- Introduce a dedicated `ITaskProvider` abstraction accessed from `IContextProvider`, keeping task-domain operations isolated from conversation and document contracts.
- Extend the shared `Task` model with calendar-sync state and introduce an `ITaskCalendarSyncService` abstraction so task persistence can coordinate future calendar providers without changing the UI contract.
- Rename the UI-side right panel container from `AgentPane` to `AgentRightPane` to reflect its broadened role as the right-side workspace container.

## Capabilities

### New Capabilities
- `agent-task-management`: Agent-view task tab behavior, scoped task presentation, inline editing, completion lifecycle, and completed-task collapse behavior.
- `task-provider-contract`: Shared task-domain contract for `Task`, `ITaskProvider`, and `IContextProvider.getTaskProvider()`.

### Modified Capabilities
- `agent-task-management`: Timed tasks now need deterministic Google Calendar synchronization behavior, reminder rules, and failure semantics in addition to the existing task-tab lifecycle.
- `task-provider-contract`: The shared task contract now needs calendar-sync state and task-provider-managed sync coordination for timed tasks.
- `agent-view`: The Agent right-side workspace surface must evolve from a conversation-only panel to a tabbed conversation/tasks container.
- `knowledge-context-provider`: Workspace context access must expose task-provider resolution alongside existing document and conversation context behaviors.

## Impact

- Affected code: `packages/ui` Agent right-panel components and tests, `packages/core` context/task contracts, and desktop/server/host-specific context-provider implementations that resolve task data.
- APIs: `Task` gains calendar-sync metadata, and task persistence coordinates a new `ITaskCalendarSyncService` without changing the right-panel UI contract.
- Persistence: requires a task storage/query implementation that distinguishes document-scoped tasks from project-scoped tasks while hiding that distinction in the UI, and also persists desktop-only Google Calendar sync state for timed tasks.
- Dependencies: requires Google Calendar REST API integration through OAuth 2.0 user authorization with offline access for the desktop host.
- Validation: requires unit coverage for provider contracts and UI behavior, plus end-to-end verification for task creation, editing, completion, collapse, scope switching, and timed-task calendar sync behavior on desktop.
