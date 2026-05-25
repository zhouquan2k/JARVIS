## 1. Core task contracts

- [x] 1.1 Add `Task`, `TaskPriority`, and `ITaskProvider` definitions under `packages/core/src/interfaces`, and export them from `packages/core/src/index.ts`.
- [x] 1.2 Extend `IContextProvider` with `getTaskProvider()` and update `createMockContextProvider` plus related tests to provide an in-memory task provider.
- [x] 1.3 Add or update core interface tests to verify document-scoped tasks, project-scoped tasks, and provider normalization of `id` / timestamp fields.

## 2. Context-provider and bridge plumbing

- [x] 2.1 Extend `packages/node/src/context/FileSystemContextProvider.ts` to expose `getTaskProvider()` and define the first local task storage/query behavior.
- [x] 2.2 Extend `packages/core/src/providers/context/HttpContextProvider.ts`, `apps/server/src/services/httpContextService.ts`, and `apps/server/src/routes/context.ts` with task-provider-backed HTTP endpoints for get/create/update/delete/complete operations.
- [x] 2.3 Extend desktop bridge files (`apps/desktop/src/context/createDesktopContextProvider.ts`, `apps/desktop/src/env.d.ts`, `apps/desktop/main/preload.ts`, `apps/desktop/main/contextIpc.ts`) to forward `ITaskProvider` operations.
- [x] 2.4 Update server/provider tests to cover task-provider resolution and task operation forwarding across local, HTTP, and desktop bridge paths.

## 3. Agent right-panel UI

- [x] 3.1 Rename `packages/ui/src/components/AgentPane.vue` to `AgentRightPane.vue`, update exports/imports, and preserve existing conversation-context synchronization behavior.
- [x] 3.2 Add tab-state handling in `AgentRightPane` so the right panel can switch between conversations and tasks without affecting the middle document pane.
- [x] 3.3 Add `packages/ui/src/components/AgentTaskPanel.vue` to load tasks for the active document scope or active project scope and keep those scopes mutually exclusive.
- [x] 3.4 Add `packages/ui/src/components/TaskEditorInline.vue` for inline create/edit with title, notes, due date-time, and priority fields.
- [x] 3.5 Implement task-row actions for save, delete, complete, reopen, and completed-section collapse, including visible due date-time rendering for tasks with `dueAt`.

## 4. UI and behavior tests

- [x] 4.1 Update right-panel component tests to cover tab switching, conversation preservation, and the `AgentPane` → `AgentRightPane` rename.
- [x] 4.2 Add `AgentTaskPanel` and `TaskEditorInline` unit tests for document-scope loading, project-scope loading, inline create/edit flows, completion transitions, and completed-task collapse behavior.
- [x] 4.3 Add Playwright E2E cases that verify task-tab rendering, scope-specific task isolation, inline creation/editing, completion/reopen/delete flows, and due date-time visibility on the real workspace path.

## 5. Verification and host-specific validation

- [x] 5.1 Run lint, type-check, and targeted package tests for `packages/core`, `packages/ui`, `packages/node`, `apps/server`, and `apps/desktop` after the implementation lands.
- [x] 5.2 Run production builds for affected packages/hosts, including `pnpm --filter extension build` after extension-related verification passes.
- [x] 5.3 Run Playwright verification for the task flows on affected hosts; if extension E2E is covered, run it with escalated permissions and `channel: 'chromium'`.
- [x] 5.4 Re-run the full required E2E suite to confirm the new task tab does not regress existing Agent conversation workflows or workspace interactions.

## 6. Desktop Google Calendar sync for timed tasks

- [x] 6.1 Extend `packages/core/src/interfaces/ITaskProvider.ts` and related exports/tests so `Task` carries calendar-sync state for external event id, provider id, sync status, last sync time, and last error.
- [x] 6.2 Add a desktop-oriented `FileSystemTaskProvider` implementation file under `packages/node/src/context/` and move task persistence there, keeping `FileSystemContextProvider` responsible only for wiring `getTaskProvider()`.
- [x] 6.3 Add `ITaskCalendarSyncService` plus a `GoogleCalendarSyncService` implementation that uses Google Calendar REST API with OAuth 2.0 offline access and computes the fixed reminder set with invalid-reminder skipping and duplicate-reminder deduplication.
- [x] 6.4 Update desktop task create/update flows so timed tasks sync on create and on title/notes/dueAt edits, while non-timed tasks skip sync and sync failures do not roll back task persistence.
- [x] 6.5 Add unit/integration tests for desktop task-provider sync behavior, including new timed-task create sync, existing-event update, non-timed skip, early-than-08:00 reminder omission, duplicate reminder deduplication, and sync-failure state persistence.
- [x] 6.6 Add or extend Playwright E2E coverage for the desktop host so creating or editing a timed task exercises the real desktop task flow and verifies the expected sync-side state without introducing new calendar-specific UI.
