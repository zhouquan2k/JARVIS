## 1. Markdown Conversation Link Model

- [x] 1.1 Add conversation-link href builders/parsers and rendered-link interception coverage in `packages/ui/src/utils/markdownDocument.ts`.
- [x] 1.2 Define a shared `LinkableConversationEntry` shape and compute current-Agent linkable conversations in `packages/ui/src/views/DocumentWorkspaceView.vue`.

## 2. Middle-Pane Authoring And Navigation

- [x] 2.1 Add a Markdown conversation-link insertion control to `packages/ui/src/components/DocumentEditorPane.vue` and wire it through `packages/ui/src/components/AgentView.vue`.
- [x] 2.2 Reuse `packages/ui/src/document-viewers/MarkdownDocumentViewer.vue` link insertion flow to persist conversation-only hrefs and emit `open-conversation-link` events on click.
- [x] 2.3 Route `open-conversation-link` through `packages/ui/src/views/DocumentWorkspaceView.vue` without changing the active document selection.

## 3. Right-Pane Conversation Opening

- [x] 3.1 Add an explicit open-conversation request channel from `DocumentWorkspaceView` through `packages/ui/src/components/AgentPane.vue` into `packages/ui/src/components/AgentConversationPanel.vue`.
- [x] 3.2 Update `AgentConversationPanel` and related `packages/ui/src/store/chat.ts` flows so a valid current-Agent request selects the target local conversation and forces detail mode.
- [x] 3.3 Keep invalid, deleted, or out-of-scope conversation-link requests as no-ops that preserve current panel state.

## 4. Verification

- [x] 4.1 Add Vitest coverage for markdown href parsing, insertion behavior, workspace routing, and right-pane request handling.
- [x] 4.2 Add Playwright web E2E that inserts a conversation link into a Markdown document, saves it, clicks the rendered link, and verifies the requested conversation opens in the right pane while the document remains open.
- [x] 4.3 Add Playwright extension E2E for the same flow using `channel: 'chromium'`, then run `pnpm --filter extension build`.
- [x] 4.4 Run lint, typecheck, relevant package builds, and the affected Playwright regression suites before marking the change ready.
