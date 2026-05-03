## 1. Core Message Contracts

- [x] 1.1 Add `MessageFunctionalPartKind` and `MessageFunctionalPart` to `packages/core/src/interfaces/Conversation.ts`.
- [x] 1.2 Add optional `functionalParts` to `ConversationMessage`, clone helpers, and normalization helpers.
- [x] 1.3 Add optional `functionalParts` to `ProviderStreamUpdate` and `ProviderSendResult` in `packages/core/src/interfaces/IModelProvider.ts`.
- [x] 1.4 Update desktop and extension proxy/provider protocol types to pass through `functionalParts` without changing existing message fields.
- [x] 1.5 Add core unit tests covering `functionalParts` clone and normalize compatibility for old conversations.

## 2. Shared Functional Message Rendering

- [x] 2.1 Add `packages/ui/src/components/MessageFunctionalParts.vue` with default-collapsed functional detail sections.
- [x] 2.2 Render `MessageFunctionalParts` from `packages/ui/src/views/NormalChatView.vue` for assistant messages with `functionalParts`.
- [x] 2.3 Update `packages/ui/src/store/chat.ts` to store `functionalParts` from streaming updates and final provider results.
- [x] 2.4 Ensure `buildProviderHistory()` continues to omit `functionalParts` from model context.
- [x] 2.5 Add UI/store tests for collapsed rendering, expansion, no-empty-render behavior, and persistence in normal chat and Agent flows.

## 3. Provider and Agent Runtime Functional Parts

- [x] 3.1 Update `packages/core/src/agents/runtime/createAgentRuntime.ts` to build shared functional parts for Agent tool calls and results.
- [x] 3.2 Keep Agent runtime text streaming compatible while also returning `functionalParts`.
- [x] 3.3 Update `packages/core/src/providers/model/ChatGPTWebProvider.ts` to emit `functionalParts` only from confidently structured search/tool/function metadata.
- [x] 3.4 Update `packages/core/src/providers/model/GeminiApiProvider.ts` to emit `functionalParts` from structured function/tool metadata when available.
- [x] 3.5 Add provider/runtime tests for Agent tool-loop functional parts, ChatGPT structured metadata normalization, Gemini function metadata normalization, and no-guessing fallback.

## 4. Viewer Search Interface, Markdown Search, and Save State

- [x] 4.1 Add `packages/ui/src/utils/markdownSearch.ts` and unit tests for empty query, case-insensitive matches, multiple matches, and Chinese keyword matches.
- [x] 4.2 Add a reusable viewer search handle/interface in `packages/ui/src/document-viewers/types.ts` and keep non-Markdown viewers non-searchable until they implement it.
- [x] 4.3 Update `DocumentEditorPane.vue` to handle viewer search UI, `Ctrl+F` / `Cmd+F` only when the active viewer supports search, match navigation, and `isDirty` save-button state.
- [x] 4.4 Update `MarkdownDocumentViewer.vue` to implement the viewer search handle, highlight matches in viewer DOM, expose match count and scrolling methods, and clear highlights safely.
- [x] 4.5 Pass active dirty state from `DocumentWorkspaceView.vue` into `DocumentEditorPane`.
- [x] 4.6 Add component tests for shortcut behavior, unsupported viewer shortcut fallback, search handle wiring, Markdown highlight cleanup, and dirty/saving save-button styling.

## 5. Conversation Rename

- [x] 5.1 Add `renameLocalConversation(id, title)` to `packages/ui/src/store/chat.ts`.
- [x] 5.2 Add inline rename interaction to `packages/ui/src/components/ConversationSidebar.vue` for local history rows.
- [x] 5.3 Wire `rename-local` from `packages/ui/src/views/ConversationWorkspaceView.vue` to the chat store action.
- [x] 5.4 Add tests for rename submit, empty title normalization, active conversation refresh, cancel behavior, and external-history exclusion.

## 5A. Human Message Edit And Resend

- [x] 5A.1 Add `editingQuestionId` plus `startQuestionEdit`, `cancelQuestionEdit`, and truncation logic to `packages/ui/src/store/chat.ts`.
- [x] 5A.2 Update `sendDraft()` so edit-mode resend deletes the selected question and all later turns before sending the revised prompt.
- [x] 5A.3 Add transcript-level edit controls and edit-mode composer notice to `packages/ui/src/views/NormalChatView.vue`.
- [x] 5A.4 Add localized strings for edit, cancel, and “sending will delete later turns” messaging in `packages/ui/src/i18n/messages/en.ts` and `packages/ui/src/i18n/messages/zh-CN.ts`.
- [x] 5A.5 Add store and view tests covering draft backfill, cancel-without-mutation, resend tail truncation, and provider-history reset semantics.

## 6. Agent Folder Index Document

- [x] 6.1 Add default index helpers and `openDefaultAgentIndex(ownerPath)` to `packages/ui/src/store/documentWorkspace.ts`.
- [x] 6.2 Update directory open behavior so Agent owner selection opens an existing `index.md` while preserving `selectedNodePath` as the Agent scope.
- [x] 6.3 Update `DocumentWorkspaceView.vue` main-pane condition so `AgentView` shows only when an Agent owner is selected and no default document is active.
- [x] 6.4 Add tests for Agent owner with existing `index.md`, Agent owner without `index.md`, root `/index.md`, and right-pane Agent context preservation.

## 7. Localization

- [x] 7.1 Add translation keys to `packages/ui/src/i18n/types.ts`.
- [x] 7.2 Add English strings to `packages/ui/src/i18n/messages/en.ts`.
- [x] 7.3 Add Chinese strings to `packages/ui/src/i18n/messages/zh-CN.ts`.
- [x] 7.4 Add or update i18n tests so new static labels are covered by the localization runtime.

## 8. E2E and Verification

- [x] 8.1 Add Playwright e2e coverage for Markdown search, local conversation rename, save dirty state, shared functional detail expansion, and Agent folder `index.md`.
- [x] 8.2 Run `pnpm lint`.
- [x] 8.3 Run `pnpm exec tsc --noEmit`.
- [x] 8.4 Run `pnpm --filter core test`.
- [x] 8.5 Run `pnpm --filter ui test`.
- [x] 8.6 Run `pnpm build`.
- [x] 8.7 Start the relevant dev host and perform service probing plus manual smoke checks for the five user-facing workflows.
- [x] 8.8 Run full Playwright e2e regression; for extension e2e request escalation and use Chromium channel for MV3 service worker support.
- [x] 8.9 If extension e2e passes or extension code is touched, run `pnpm --filter extension build`.

## 9. Chat `@filename` Context Injection

- [x] 9.1 Keep the existing first-turn current-document behavior unchanged and document it with regression coverage in `packages/ui/src/store/chat.test.ts`.
- [x] 9.2 Add `@filename` reference extraction and workspace-file resolution to `packages/ui/src/store/chat.ts`, including duplicate removal and clear missing/ambiguous reference errors.
- [x] 9.3 Extend shared prompt augmentation helpers so referenced text files are appended as standalone filename-labeled sections without removing `@filename` from the user's original question text.
- [x] 9.4 Update the conversation and knowledge workspace specs/tests to cover unique basename matching, unique path-suffix matching, and non-text-file rejection.
- [x] 9.5 Run `pnpm lint`, `pnpm exec tsc --noEmit`, and the affected unit tests for the chat/context pipeline after implementation.
