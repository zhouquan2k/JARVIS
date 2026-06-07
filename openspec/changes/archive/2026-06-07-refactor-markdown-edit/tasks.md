# Tasks: refactor-markdown-edit

## 1. P1 — Highlight via live toggleMark (prototype hardening)

- [x] 1.1 Add `toggleMarkdownHighlightAtViewerSelection(editor)` in `packages/ui/src/utils/markdownDocument.ts` (import `toggleMark` from `@milkdown/kit/prose/commands`).
- [x] 1.2 Expose `toggleHighlightInViewer()` from `packages/ui/src/document-viewers/MarkdownDocumentViewer.vue` via `defineExpose`.
- [x] 1.3 Route viewer-mode highlight in `DocumentEditorPane.insertMarkdownStyleSnippetIntoDocument` to the in-place command; keep edit-mode source path.
- [x] 1.4 Update affected unit tests + mocks (`DocumentEditorPane.test.ts`, `MarkdownDocumentViewer.test.ts`).
- [x] 1.5 Re-enable any temporarily-commented viewer fallback decision: confirm prototype is the permanent path (remove the commented old fallback once verified) and adjust the empty-selection highlight behavior to use stored marks so the next typed text is highlighted.

## 2. P2 — Link / conversation-link via live link mark

- [x] 2.1 Add `applyMarkdownLinkAtViewerSelection(editor, { label, href })` in `markdownDocument.ts` (non-empty selection → `addMark` link over range; collapsed → insert label text carrying the link mark; single transaction; guard on `schema.marks.link`).
- [x] 2.2 Expose an `applyLinkInViewer(input)` command from `MarkdownDocumentViewer.vue`; make `insertMarkdownLink` / `insertMarkdownConversationLink` delegate to it in viewer mode, keep edit-mode source path.
- [x] 2.3 Route document-link and conversation-link insertion in `DocumentEditorPane` viewer mode to the in-place command (drop `prepareMarkdownSelectionFromViewer` + `runMarkdownInsertion` for those viewer paths).
- [x] 2.4 Update/extend unit tests for link insertion in viewer mode (asserts: applied via in-place command, no source-offset mapping called, picker closes).

## 3. P3 — Block-node insertion (resource / image) [optional follow-up]

- [x] 3.1 Replace naive `insertMarkdownAtViewerSelection` with inline/block-aware insertion (inline content into current block; block content as a standalone node with caret handling).
- [x] 3.2 Route resource-link / pasted-image / dynamic snippet viewer insertion to the corrected command; keep edit-mode source path.
- [x] 3.3 Add unit tests for inline vs block insertion correctness.

## 4. P4 — Retire source-offset mapping + round-trip

- [x] 4.1 Remove viewer-only helpers once unused: `prepareMarkdownSelectionFromViewer`, `captureRenderableMarkdownSelection`, `resolveMarkdownSourceSelection`, `resolveEmptyBlockMarkdownOffset`, `resolveEmptyBlockAnchorFallback` (and their tests). (`captureRenderableMarkdownSelection` / `resolveMarkdownSourceSelection` retained for viewer paste path; `prepareMarkdownSelectionFromViewer`, `resolveEmptyBlockMarkdownOffset`, `resolveEmptyBlockAnchorFallback` removed.)
- [x] 4.2 Remove the viewer branches of `runMarkdownInsertion`; keep edit-mode insertion.
- [x] 4.3 Simplify the mode-switch scroll watcher in `MarkdownDocumentViewer.vue` (capture only when leaving viewer).

## 5. Documentation

- [x] 5.1 Update `ARCHITECTURE.zh-CN.md` to describe the "one semantic command, two native backends, dispatch by mode" model.
- [x] 5.2 At archive time, merge the design class diagram into the global class diagram (`workspace.dsl`).

## 6. Verification

- [x] 6.1 `pnpm --filter @packages/ui exec tsc --noEmit` and `pnpm --filter @packages/ui test` pass.
- [x] 6.2 `pnpm --filter @packages/ui build` passes.
- [x] 6.3 Add e2e coverage: viewer-mode highlight and link insertion keep the viewport stable and apply at the correct selection (success path + toggle-off for highlight). (`apps/web2/tests/e2e/viewer-mode-edit.spec.ts`, 4 tests.)
- [x] 6.4 Run the full e2e suite to confirm no regression. (1 pre-existing flaky smoke test unrelated to this change; all new tests pass.)
