## 1. Phase 1 — Full switch to VPS; local server stops (config only)

- [x] 1.1 Point all daily-use clients at the VPS: phone web2 same-origin; Mac via browser (or a desktop build with hub-backed sync/codex URLs and the shared syncKey); keep the Mac local server only for local web2/API development simulation
- [x] 1.2 Verify end-to-end: conversations from all clients converge in hub SQLite under the same syncKey; documents readable/writable via VPS (Dropbox replica); local files still editable via Obsidian
- [x] 1.3 Automate the common NAS deployment flow: build the server image locally as `linux/amd64`, load it into NAS Docker, replace `jarvis-server`, and document the script usage
- [x] 1.4 Update `my-README.md` launch flows (VPS is the only daily-use server; local server commands remain only under development/simulation)

## 2. Phase 2 — Hub-side task sync (server)

- [x] 2.1 Add `sync_tasks` table + migration in `apps/server/src/schema.ts`
- [x] 2.2 Implement `normalizeTask` whitelist normalizer in `apps/server/src/types/sync.ts` with unit tests (unknown-field stripping, invalid payload rejection)
- [x] 2.3 Add `upsertTasks` / `listTasksSince` to `apps/server/src/repositories/syncRepository.ts`
- [x] 2.4 Add `pushTasks` / `pullTasks` with per-task LWW to `apps/server/src/services/syncService.ts` (unit tests: stale push, cursor independence)
- [x] 2.5 Register `/api/sync/tasks/push` and `/api/sync/tasks/pull` in `apps/server/src/routes/sync.ts`; extend `apps/server/tests/sync-api.test.ts`
- [x] 2.6 One-time `tasks.json` → `sync_tasks` import on startup (migration-flag pattern from `runDocumentIdMigration`), with test fixture
- [x] 2.7 Move Google Calendar sync invocation to the task push path (hub credentials); remove calendar wiring from `FileSystemTaskProvider`

## 3. Phase 2 — Client task replica (task-mgr)

- [x] 3.1 Implement `plugins/task-mgr/src/replica/TaskReplicaProvider.ts` (IndexedDB-backed `TaskService`, dirty marking) with unit tests
- [x] 3.2 Implement `plugins/task-mgr/src/replica/TaskSyncClient.ts` (pushDirty / pullSince; push on mutation + startup compensation, pull at startup, no periodic timer; injected fetchImpl) with unit tests
- [x] 3.3 Wire provider selection in task-mgr runtime: replica-backed behind a flag, HTTP fallback retained
- [x] 3.4 Verify task views (today / planned / by-document) read from the replica and work offline (e2e: edit task offline, reconnect, converge)
- [x] 3.5 Flip the flag to replica-by-default after migration verified; remove HTTP task read path

## 4. Phase 3 — Desktop IPC context provider

- [x] 4.1 Create `apps/desktop2/main/contextProviderIpc.ts` hosting `FileSystemContextProvider` (`conversationQueryProvider: null`) with one `ipcMain.handle` channel per `IContextProvider` method
- [x] 4.2 Expose preload bridge (`window.jarvisContext`) and add a contract test asserting every interface method has a registered channel
- [x] 4.3 Implement renderer-side `IpcContextProvider implements IContextProvider` and wire it into desktop runtime options
- [x] 4.4 Serve document-linked conversation lists from the client IndexedDB replica (replacing `conversationQueryProvider`)

## 5. Phase 3 — Desktop local shell & server retirement

- [x] 5.1 Switch renderer loading in `apps/desktop2/main/index.ts` from server origin to local bundle (loadFile/custom protocol) behind a build flag
- [x] 5.2 Implement main-proxied fetch (preload `window.jarvisFetch`, `net.fetch` in main) and inject as `fetchImpl` into sync transports
- [x] 5.3 Move bilibili import invocation to IPC (main hosts `BilibiliTranscriptService`)
- [x] 5.4 e2e: launch desktop offline with no server process — documents, tasks, conversations all functional; run full e2e suite for regressions
- [x] 5.5 Cancelled: codex stays VPS-served in the desktop build (no local channel); finalize launch docs (`my-README.md`); keep server code for hub deployment

## 6. Phase 4 — Mobile PWA (web2)

- [x] 6.1 Add `vite-plugin-pwa` (Workbox) to `apps/web2/vite.config.ts`: precache app shell, runtime read-only cache for document reads; add manifest + icons in `apps/web2/public/`
- [x] 6.2 Verify offline shell: load web2 online once, go offline, page opens and conversations/tasks are usable from replicas
- [x] 6.3 Scope update accepted: phone online mode is verified and the real-phone offline / add-to-home-screen standalone acceptance is deferred out of this change. Web/preview offline read-only verification remains in code, but final acceptance for this change no longer depends on secure-context mobile offline validation.

## 7. Documentation

- [x] 7.1 Update `docs/online-refactor.md` phase checkboxes as phases land
- [x] 7.2 Verify design consistency with `ARCHITECTURE.md`; update architecture docs and workspace.dsl class diagram at archive time (bilingual)
