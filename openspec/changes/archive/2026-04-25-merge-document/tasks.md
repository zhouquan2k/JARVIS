## 1. Archive orchestration service

- [x] 1.1 Add `packages/ui/src/services/conversationArchive.ts` with Q/A splitting, archive prompt construction, and merged-result synthesis.
- [x] 1.2 Implement first-divider detection, `***` exclusion, and automatic `---` insertion when the active Markdown document has no archive boundary.
- [x] 1.3 Add service-level tests for full-conversation merge, deleted-message exclusion, and no-change detection.

## 2. Store integration and archive eligibility

- [x] 2.1 Extend `packages/ui/src/store/chat.ts` with `canArchiveCurrentConversation()` and `archiveCurrentConversationToDocument()` using the current effective provider/model selection.
- [x] 2.2 Extend `packages/ui/src/store/documentWorkspace.ts` with `applyGeneratedDocumentChange(...)` so archive writes enter the existing file change history instead of bypassing it.
- [x] 2.3 Add store tests covering agent-mode-only execution, selected-Markdown-document checks, archive success, archive no-change, and archive failure behavior.

## 3. Workspace UI and messaging

- [x] 3.1 Update `packages/ui/src/views/NormalChatView.vue` to show the archive action only in eligible agent-mode Markdown-document contexts and to disable repeated clicks while archive is running.
- [x] 3.2 Add archive feedback copy to `packages/ui/src/i18n/messages/en.ts` and `packages/ui/src/i18n/messages/zh-CN.ts` for success, no-change, inserted-divider, and failure states.
- [x] 3.3 Add component tests for archive button visibility and action feedback in `NormalChatView`.

## 4. Verification and end-to-end coverage

- [x] 4.1 Add Playwright E2E coverage for archiving an agent conversation into a Markdown document and verifying the updated document content and diff visibility.
- [x] 4.2 Extend E2E coverage to verify that undo restores the pre-archive document and redo restores the archived result.
- [x] 4.3 Run the required validation sequence for the affected UI packages, including lint/typecheck, targeted tests, and the relevant Playwright workflow.

## 5. Persisted archive state and UI status

- [x] 5.1 Extend the local conversation model and persistence flow with archive metadata that records archived document path, archived timestamp, and a snapshot marker for stale detection.
- [x] 5.2 Update `packages/ui/src/store/chat.ts` to persist archive status after successful archive/no-change runs and recompute `idle` / `archived` / `stale` as the visible conversation changes.
- [x] 5.3 Update `packages/ui/src/views/NormalChatView.vue` and i18n messages to show the persisted archive status near the archive action.
- [x] 5.4 Add unit/component tests for archive status persistence, stale-state transitions, reload behavior, and status rendering.
- [x] 5.5 Extend Playwright coverage to verify persisted archive status survives reload and changes from archived to stale after a new turn.
