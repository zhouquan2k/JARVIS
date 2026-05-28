## 1. Shared task query contract

- [x] 1.1 Extend `packages/core/src/interfaces/ITaskProvider.ts` with `TaskQueryTag` and update `getTasks(documentPath, agentKey, completed, tag)` so null/null means a global task query.
- [x] 1.2 Update `packages/node/src/context/FileSystemTaskProvider.ts` and `packages/core/src/testing/createMockContextProvider.ts` to preserve document scope, agent scope, and global scope semantics while applying provider-side `all` / `today` / `planned` filtering.
- [x] 1.3 Update context-provider facades and bridges (`packages/core/src/providers/context/HttpContextProvider.ts`, `apps/server/src/services/httpContextService.ts`, `apps/server/src/routes/context.ts`, `apps/desktop/src/context/createDesktopContextProvider.ts`, `apps/desktop/main/contextIpc.ts`, `apps/desktop/main/preload.ts`, `apps/desktop/src/env.d.ts`) so the new tag and global-query semantics are forwarded consistently.
- [x] 1.4 Add or update provider and route tests to verify document-scoped queries, agent-scoped queries, global null/null queries, `today` filtering, and `planned` future-task filtering.

## 2. Reusable task list surface

- [x] 2.1 Add `packages/ui/src/components/TaskListPanel.vue` to own shared task loading, inline create/edit, delete, complete/reopen, and completed-section collapse behavior.
- [x] 2.2 Refactor `packages/ui/src/components/AgentTaskPanel.vue` into a thin scope wrapper that resolves current document or agent scope and reuses `TaskListPanel`.
- [x] 2.3 Extend `TaskListPanel` so the `planned` mode can render grouped date sections without changing the flat task persistence shape.
- [x] 2.4 Add component tests for `TaskListPanel` and update `AgentTaskPanel` tests to cover shared interactions, scoped loading, and planned date grouping behavior.

## 3. All-tasks workspace route and UI

- [x] 3.1 Add `packages/ui/src/views/AllTasksWorkspaceView.vue` with a shortcut-style left pane that exposes at least `today` and `planned` filters.
- [x] 3.2 Update `packages/ui/src/routes.ts`, `packages/ui/src/views/WorkspaceHostApp.vue`, and `packages/ui/src/components/AppTopBar.vue` so `/all-tasks` is a top-level workspace destination alongside the existing primary routes.
- [x] 3.3 Update host routers (`apps/web/src/router.ts`, `apps/desktop/src/router.ts`, `apps/extension/src/router.ts`) so the all-tasks route resolves consistently in every supported host.
- [x] 3.4 Add or update UI tests for all-tasks route selection, shortcut filter switching, and planned-task date-group rendering in the dedicated workspace view.

## 4. End-to-end coverage

- [x] 4.1 Add Playwright test cases that cover opening the all-tasks workspace, switching between `today` and `planned`, and verifying grouped planned-task rendering on the real UI flow.
- [x] 4.2 Extend existing task-flow Playwright coverage to confirm that Agent-scoped task behavior still works after `TaskListPanel` extraction and shared query-contract changes.

## 5. Verification

- [x] 5.1 Run lint, type-check, and targeted package tests for affected core, node, server, ui, and desktop code after implementation.
- [x] 5.2 Run affected production builds, including `pnpm --filter extension build` after any extension verification completes.
- [x] 5.3 Run Playwright verification for the affected hosts and re-run the required E2E suite to confirm the new all-tasks workspace does not regress existing workspace or task flows.
