## 1. Shared Task Contract

- [x] 1.1 Extend the shared `Task` model and task-facing type exports with the persisted `executionState` field and its mutually exclusive value set.
- [x] 1.2 Update task persistence and bridge layers (`packages/node`, `packages/core`, HTTP/context facades, mocks) so task create/read/update flows preserve `executionState`.
- [x] 1.3 Add or update contract and persistence tests that verify tasks can round-trip `executionState` without requiring a second mapping object.

## 2. Workspace Navigation Bridge

- [x] 2.1 Add a workspace-owned `WorkspaceNavigationApi.openNode(path, options)` bridge in `packages/ui` that restores the knowledge-workspace route and forwards optional `tab` / `detailKey` state.
- [x] 2.2 Keep `documentWorkspace.openNode()` route-free while adding any minimal store helpers needed to reopen document paths and agent/project owner paths through the higher-level bridge.
- [x] 2.3 Add UI tests that verify the navigation bridge restores the knowledge-workspace route and passes task-related restoration state to the destination workspace.

## 3. Task List and Editor Behavior

- [x] 3.1 Refactor `plugins/task-mgr/src/components/TaskListPanel.vue` so edit mode renders inline at the current task row instead of at a panel-level editor slot.
- [x] 3.2 Extend `plugins/task-mgr/src/components/TaskEditorInline.vue` to edit the mutually exclusive `executionState` field and keep `today`-shortcut creation defaulting to today's date without forcing a time.
- [x] 3.3 Update task-row rendering so execution-state metadata is shown separately from document/agent scope metadata and is visually distinguishable.
- [x] 3.4 Apply execution-state-first ordering in shared task-list rendering while preserving the existing due-date and updated-at ordering inside each tier.
- [x] 3.5 Wire all-tasks row clicks to the workspace navigation bridge so document-scoped tasks reopen their document path and project-scoped tasks reopen their owner path with task `tab` / `detailKey` restoration.
- [x] 3.6 Add or update component tests for inline row editing, today-default draft initialization, execution-state rendering, execution-state ordering, and task-to-workspace navigation requests.

## 4. Verification

- [x] 4.1 Add or update Playwright coverage for the all-tasks flow: inline row editing, today-default creation, execution-state ordering/display, and reopening workspace context from a task row.
- [x] 4.2 Run the required lint/type/test/build checks for the affected packages and hosts.
- [x] 4.3 Run the relevant full E2E verification surface, including extension Playwright coverage with the required elevated `chromium` channel setup, and rebuild the extension afterward if those tests are part of the affected scope.

## 5. Additional Task Filters

- [x] 5.1 Extend the shared `TaskQueryTag` contract and all task-query normalization layers so the system supports `scheduled` and `backlog` in addition to the existing `all` / `today` / `planned` tags.
- [x] 5.2 Update the real task provider and mock task provider filtering logic so `scheduled` means `executionState !== null` and `backlog` means `dueAt === null && executionState === null`.
- [x] 5.3 Expand the all-tasks left panel UI and i18n strings to expose the new `已规划` and `未规划 / backlog` entries without replacing existing shortcuts.
- [x] 5.4 Add or update contract, provider, and component tests that cover the new tag semantics and left-panel filtering behavior.

## 6. Markdown Link Upload

- [x] 6.1 Extend `DocumentEditorPane` so the existing Markdown link picker can trigger an upload-new-file action inside the current link-insertion flow.
- [x] 6.2 Add the workspace/view/store bridge needed to write the uploaded file into the current document's linkable resource scope, refresh the workspace/resource list, and return the new path for immediate link insertion.
- [x] 6.3 Add or update editor interaction tests that verify a newly uploaded file can be inserted as a link target from the same flow.

## 7. Refresh Current Document

- [x] 7.1 Add a workspace-store action that reloads the active document from disk without going through the save-first `openNode(activePath)` path.
- [x] 7.2 Add a `Refresh current document` button to the Markdown editor toolbar and route it through the workspace view layer instead of embedding filesystem logic in the editor component.
- [x] 7.3 Require a confirmation step when the current document is dirty before reloading, and add or update tests that cover both confirm and cancel paths.

## 8. Verification for This Increment

- [x] 8.1 Run the affected lint/type/test/build checks for `packages/ui`, `plugins/task-mgr`, `packages/node`, and any touched host package after the new task-filter and Markdown editor changes land.
- [x] 8.2 Run the minimal regression surface for all-tasks filtering plus Markdown editor link-upload/refresh behavior, and record any remaining gaps if full E2E coverage is not yet realistic.
