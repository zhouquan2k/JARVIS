## 1. Core Title Generation Contract

- [x] 1.1 Add `GenerateConversationTitleOptions` and optional `generateConversationTitle(...)` to `packages/core/src/interfaces/IModelProvider.ts`.
- [x] 1.2 Update shared exports, mock providers, and interface tests so providers without title-generation support remain compatible.
- [x] 1.3 Add unit coverage for the optional provider capability and its independence from active chat reasoning/model options.

## 2. Provider and Host Proxy Support

- [x] 2.1 Implement `generateConversationTitle(...)` in `packages/core/src/providers/model/ChatGPTWebProvider.ts` using a provider-selected low-cost non-thinking model and normalized title output.
- [x] 2.2 Implement `generateConversationTitle(...)` in `packages/core/src/providers/model/GeminiApiProvider.ts` using a provider-selected low-cost non-thinking model and normalized title output.
- [x] 2.3 Extend extension proxy protocol and `apps/extension/src/utils/BackgroundProxyProvider.ts` plus `apps/extension/entrypoints/background.ts` to forward conversation-title requests.
- [x] 2.4 Extend desktop proxy protocol and `apps/desktop/src/utils/DesktopProxyProvider.ts` plus `apps/desktop/main/providerHost.ts` to forward conversation-title requests.
- [x] 2.5 Add provider and proxy tests covering low-cost-model selection, normalized output, capability absence compatibility, and forwarding behavior.

## 3. Shared Store and Fallback Title Flow

- [x] 3.1 Add title sanitization and deterministic fallback helpers to `packages/ui/src/utils/conversationTitle.ts`.
- [x] 3.2 Update `packages/ui/src/store/chat.ts` so new conversations keep `New Chat` until the first send succeeds, then request provider-side title generation or local fallback.
- [x] 3.3 Regenerate the title only when the first visible question is edited and resent; preserve manual renames and ordinary follow-up titles.
- [x] 3.4 Persist generated titles through the existing conversation save path so sidebar, restored detail views, and Agent-pane views stay consistent.

## 4. Normal Chat and Knowledge Workspace Coverage

- [x] 4.1 Add `packages/ui/src/store/chat.test.ts` coverage for first-turn auto titling, failure fallback, first-question edit resend, and preserving manual rename behavior.
- [x] 4.2 Add or update `apps/web/tests/e2e/normal-chat.spec.ts` to verify a new normal conversation renames itself from `New Chat` after the first successful send.
- [x] 4.3 Add or update `apps/web/tests/e2e/knowledge-workspace.spec.ts` to verify a new Agent-pane conversation renames itself after the first successful send and keeps the persisted title in list/detail surfaces.
- [x] 4.4 If extension host coverage touches the same flow, add or update Playwright extension e2e for the conversation-title behavior using Chromium channel.

## 5. AgentMode File Tree Presentation

- [x] 5.1 Add shared UI coverage for AgentMode file-name presentation so Markdown filenames display without `.md` while non-Markdown files keep their original names and icons.
- [x] 5.2 Update `packages/ui/src/store/documentWorkspace.test.ts` and `packages/ui/src/components/DocumentFileTree.test.ts` for file creation and rename normalization so bare Markdown names are saved with `.md`.
- [x] 5.3 Add or update `apps/web/tests/e2e/knowledge-workspace.spec.ts` to verify AgentMode file tree creation, display-name hiding, and non-Markdown file icons.
- [x] 5.4 Add `getLinkableMarkdownDocuments(...)` coverage in `packages/ui/src/store/documentWorkspace.test.ts` so the knowledge workspace reuses current Agent-scope Markdown documents, excludes the active document, and returns stable link candidates.
- [x] 5.5 Update `packages/ui/src/components/DocumentEditorPane.test.ts`, `packages/ui/src/document-viewers/MarkdownDocumentViewer.test.ts`, and `packages/ui/src/utils/markdownDocument.test.ts` for the Markdown link insertion button, chooser behavior, selection wrapping, and relative href generation.
- [x] 5.6 Add or update `apps/web/tests/e2e/knowledge-workspace.spec.ts` to verify that a user can insert an internal Markdown link from the editor UI and open the linked document through the existing workspace link behavior.
- [x] 5.7 Extend `packages/ui/src/utils/markdownDocument.ts` and `packages/ui/src/utils/markdownDocument.test.ts` with viewer-mode image enhancement, source-span resolution, and Markdown width rewrite helpers for local document images only.
- [x] 5.8 Update `packages/ui/src/document-viewers/MarkdownDocumentViewer.vue` and `packages/ui/src/components/DocumentEditorPane.vue` plus affected tests so viewer-mode image drag-resize rewrites `modelValue` through the existing document update flow without adding a new persistence channel.
- [x] 5.9 Add or update `apps/web/tests/e2e/knowledge-workspace.spec.ts` to verify local Markdown images can be resized from viewer mode, persist width across view/edit toggles, and do not rewrite remote or ambiguous image sources.
- [x] 5.10 Add Markdown image-paste persistence so pasted clipboard images are written under a document-local `references/` directory and inserted as document-relative Markdown image references instead of inline `data:` payloads.
- [x] 5.11 Add unit and component coverage for pasted-image file naming, relative-path insertion, failure handling, and preserving existing document content when `references/` file writes fail.
- [x] 5.12 Add or update `apps/web/tests/e2e/knowledge-workspace.spec.ts` to verify pasting an image into a Markdown document creates a `references/` asset, inserts a relative Markdown image reference, and keeps the document readable.

## 6. Verification

- [x] 6.1 Run lint, typecheck, and affected unit tests for core, UI, provider, and proxy changes.
- [x] 6.2 Run build verification for the affected packages and full workspace build as required by the repo verification order.
- [x] 6.3 Start the relevant dev host, probe availability, and perform a smoke check that first-send title generation works in normal chat and Agent mode.
- [x] 6.4 Run full Playwright e2e regression; for extension e2e request escalation and use MV3-compatible Chromium channel.
- [x] 6.5 If extension code is touched and extension e2e passes, run `pnpm --filter extension build`.
