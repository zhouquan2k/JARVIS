## 1. Core Types and Interfaces

- [x] 1.1 Create `packages/core/src/interfaces/IDocumentIdentity.ts` — define `DocumentIdentity { id: string; currentPath: string }` and `IDocumentIdentityIndex` interface with `resolve`, `resolveByPath`, `remap`, `assignId`
- [x] 1.2 Add `resolveDocumentIds(ids: string[]): Promise<Map<string, ContextNode | null>>` and `getDocumentId(path: string): Promise<string>` to `IContextProvider` in `packages/core/src/interfaces/IContextProvider.ts`
- [x] 1.3 Add `documentIds?: string[]` to `Conversation` type in `packages/core/src/interfaces/Conversation.ts`; mark `documentPaths` as deprecated with JSDoc
- [x] 1.4 Add `documentId?: string | null` to `Task` type in `packages/core/src/interfaces/ITaskProvider.ts`; mark `documentPath` as deprecated
- [x] 1.5 Update `cloneConversation` / serialization helpers in `Conversation.ts` to carry `documentIds` through clone and parse paths

## 2. DocumentIdentityIndex Implementation

- [x] 2.1 Create `packages/node/src/context/DocumentIdentityIndex.ts` — implement in-memory `Map<id, path>` + `Map<path, id>` reverse index
- [x] 2.2 Implement `initialize(rootPath)`: scan all `.md` files, parse frontmatter for `jarvis_id`, populate both maps; detect and resolve duplicate IDs (re-assign ULID to newer-mtime file)
- [x] 2.3 Implement `assignId(path)`: generate ULID, write `jarvis_id` to frontmatter using round-trip-safe YAML write (preserve existing fields), update both maps
- [x] 2.4 Implement `remap(fromPath, toPath)`: update both maps for the given path and all paths prefixed by `fromPath/` (directory rename case)
- [x] 2.5 Create `packages/node/src/context/DocumentIdentityIndex.test.ts` — unit tests: init scan builds correct maps, duplicate-ID detection/resolution, `remap` for file and directory, `assignId` preserves existing frontmatter fields

## 3. FileSystemContextProvider Wiring

- [x] 3.1 Instantiate `DocumentIdentityIndex` in `FileSystemContextProvider` constructor; call `index.initialize(rootPath)` in `initializeAccess()`
- [x] 3.2 Implement `getDocumentId(path)` on `FileSystemContextProvider` — delegate to `index.resolveByPath(path)`, call `index.assignId(path)` if not found
- [x] 3.3 Implement `resolveDocumentIds(ids)` on `FileSystemContextProvider` — batch lookup via `index.resolve(id)`, resolve each to `ContextNode` via `findContextNodeByPath`
- [x] 3.4 Update `renameNode` to call `index.remap(oldPath, newPath)` after `fs.rename` succeeds
- [x] 3.5 Update `moveNode` to call `index.remap(oldPath, newPath)` after `fs.rename` succeeds
- [x] 3.6 Add `assertSameAgent(srcPath, dstParentPath)` helper in `FileSystemContextProvider`; throw descriptive error if `agentKey` differs; call it at the start of `moveNode`

## 4. FileSystemTaskProvider Update

- [x] 4.1 Update `getTasks` in `packages/node/src/context/FileSystemTaskProvider.ts` to accept and filter on `documentId` alongside existing `documentPath`
- [x] 4.2 Update `createTask` and `updateTask` to accept `documentId`; persist it in the task JSON file

## 5. Mock Provider Update

- [x] 5.1 Implement `resolveDocumentIds` and `getDocumentId` on `createMockContextProvider` in `packages/core/src/testing/createMockContextProvider.ts`
- [x] 5.2 Update `remapNodeSubtree` in mock provider to also remap the mock ID index when nodes are moved/renamed

## 6. Server Persistence (syncRepository)

- [x] 6.1 Add `documentIds` TEXT column (JSON) to the conversations table in SQLite schema migration in `apps/server/src/repositories/syncRepository.ts`
- [x] 6.2 Update `saveConversation` to write `documentIds`; update `getConversation`/`getAllConversations` to read it
- [x] 6.3 Add migration query: on first run, for each conversation row with `documentPaths` and no `documentIds`, call `getDocumentId` per path and back-fill `documentIds`
- [x] 6.4 Add `documentIds?: string[]` to `SyncConversation` type in `apps/server/src/types/sync.ts`; mark `documentPaths` deprecated
- [x] 6.5 Write `jarvis_schema: 1` to `.jarvis-meta.json` in workspace root upon successful migration completion

## 7. UI Store Updates

- [x] 7.1 Update `linkDocumentToConversation` in `packages/ui/src/store/chat.ts` to call `contextProvider.getDocumentId(path)` and store result in `conversation.documentIds`
- [x] 7.2 Update conversation list rendering in `chat.ts` to batch-resolve `documentIds` via `resolveDocumentIds` for display names; cache results
- [x] 7.3 Update `packages/ui/src/store/documentWorkspace.ts` — surface cross-agent move error from `moveNode` as a user-facing toast/inline message
- [x] 7.4 Update task store to use `documentId` when creating and querying tasks

## 8. Desktop IPC Bridge

- [x] 8.1 Add IPC handlers for `resolveDocumentIds` and `getDocumentId` in `apps/desktop/main/contextIpc.ts`
- [x] 8.2 Expose `resolveDocumentIds` and `getDocumentId` through `apps/desktop/shared/contextBridge.ts` and `apps/desktop/src/env.d.ts`
- [x] 8.3 Add corresponding entries to `apps/desktop/main/preload.ts`

## 9. Outgoing Link Rewrite on Move

- [x] 9.1 Add `rewriteOutgoingLinks(markdown: string, fromDir: string, toDir: string): string` to `packages/ui/src/utils/markdownDocument.ts` — parse all relative `![...](...)` and `[...](...)` occurrences, skip absolute URLs and `#` anchors, recalculate each relative path with `path.relative(toDir, path.resolve(fromDir, src))`
- [x] 9.2 Add unit tests for `rewriteOutgoingLinks`: same-dir move (no change), move up one level, move down into subdirectory, mixed relative/absolute links in same document, document with no links (no-op)
- [x] 9.3 Call `rewriteOutgoingLinks` in `documentWorkspace.moveNode` after `contextProvider.moveNode` succeeds — compute new content in memory, then call `contextProvider.writeDocument` with the rewritten content
- [x] 9.4 Guard `references/` directory: in `DocumentFileTree.vue` (or equivalent drag-and-drop handler), detect when the dragged node is a `references/` directory and block the move with a user-facing error message

## 10. Move Confirmation and Cross-Agent Error Dialogs

- [x] 10.1 Create `MoveConfirmDialog` component in `packages/ui/src/components/` — props: `nodeName: string`, `destinationPath: string`, `hasOutgoingLinks: boolean`; emits `confirm` and `cancel`; shows node name + destination; conditionally shows "links will be rewritten" warning when `hasOutgoingLinks` is true
- [x] 10.2 Create `MoveErrorDialog` component (or reuse a shared error modal) — props: `reason: 'cross-agent' | 'references-dir'`; renders appropriate blocking error message with a single dismiss action (OK button + Escape key)
- [x] 10.3 Update drag-and-drop handler in `DocumentFileTree.vue`: before calling `documentStore.moveNode`, check if target is cross-agent or a `references/` move; if so show `MoveErrorDialog`; otherwise show `MoveConfirmDialog` and only call `moveNode` on confirm
- [x] 10.4 Update context-menu "Move to" flow in `DocumentFileTree.vue`: apply the same pre-move check — show `MoveErrorDialog` on cross-agent/references guard, show `MoveConfirmDialog` on valid intra-agent move
- [x] 10.5 Pre-check whether moved `.md` document has outgoing links (call `rewriteOutgoingLinks` in dry-run mode or inspect markdown source) before opening `MoveConfirmDialog`, so the warning flag is set correctly
- [x] 10.6 Add unit tests for `MoveConfirmDialog`: renders node name and destination; shows warning when `hasOutgoingLinks=true`; hides warning when false; emits `confirm` on button click; emits `cancel` on cancel/dismiss
- [x] 10.7 Add unit tests for `MoveErrorDialog`: renders cross-agent message; renders references-dir message; emits dismiss on OK; dismisses on Escape key

## 11. Lint, Type-Check, and Unit Tests

- [x] 11.1 Run `pnpm exec tsc --noEmit` across all packages; fix all type errors introduced by the new fields
- [x] 11.2 Run `pnpm lint`; fix all lint errors
- [x] 11.3 Run `pnpm test` for `packages/core`, `packages/node`, `packages/ui`; fix any broken unit tests
- [x] 11.4 Update existing unit test fixtures that use `documentPaths` / `documentPath` to also set `documentIds` / `documentId` where needed (do not remove the deprecated fields during tests until migration is verified)

## 12. E2E Tests (Playwright)

- [x] 12.1 Add e2e test in `apps/web/tests/e2e/knowledge-workspace.spec.ts`: rename a `.md` document → verify linked conversation still shows the correct document name and navigates correctly
- [x] 12.2 Add e2e test: move a `.md` document to a sibling directory within the same agent → confirmation dialog appears → confirm → verify task association is preserved and resolves to new path
- [x] 12.3 Add e2e test: move a `.md` document that has outgoing links → confirmation dialog shows the "links will be rewritten" warning → confirm → verify links are rewritten correctly
- [x] 12.4 Add e2e test: move dialog cancel → verify node remains at original path and no content is changed
- [x] 12.5 Add e2e test: attempt to drag-and-drop a document across agent boundary → verify blocking error dialog is displayed (not a confirmation dialog) and document remains at original path
- [x] 12.6 Add e2e test: rename a directory containing linked documents → verify all linked conversations resolve correctly after the directory rename
- [x] 12.7 Add e2e test: open a legacy workspace (documents with no `jarvis_id`) → verify IDs are assigned on first association without corrupting document content
- [x] 12.8 Add e2e test: insert an image via paste into Markdown editor → verify generated link uses a standard relative path; move the document to a sibling directory → confirm in dialog → verify the image still renders correctly (link was rewritten) and the `.md` file contains a valid relative path
- [x] 12.9 Run full e2e suite `pnpm exec playwright test` and confirm no regressions

## 13. Build Verification

- [x] 13.1 Run `pnpm build` (all packages); confirm clean build with no errors
- [x] 13.2 Run `pnpm --filter desktop build`; confirm desktop app builds successfully
