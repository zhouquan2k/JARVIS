English | [中文](tasks.zh-CN.md)

## 1. Markdown Editor Configuration

- [x] 1.1 Add the official `mermaid` dependency to `/Users/quanzhou/Workspace/JARVIS/packages/ui/package.json` if it is not already present.
- [x] 1.2 Add `MarkdownViewerMode = 'viewer' | 'edit'` and extend `CreateMarkdownEditorOptions` in `/Users/quanzhou/Workspace/JARVIS/packages/ui/src/utils/markdownDocument.ts` with `mode` and `documentPath`.
- [x] 1.3 Configure `CrepeFeature.CodeMirror` in `createMarkdownEditor(options)` so `viewer` mode can provide previews and `edit` mode keeps Mermaid source editable.

## 2. Mermaid Preview Utility

- [x] 2.1 Add `/Users/quanzhou/Workspace/JARVIS/packages/ui/src/utils/mermaidPreview.ts` with `renderMermaidPreview(language, content, applyPreview)` and lazy Mermaid initialization.
- [x] 2.2 Initialize Mermaid with `startOnLoad: false` and `securityLevel: 'strict'`.
- [x] 2.3 Convert Mermaid syntax/render failures into a bounded preview error or safe fallback without throwing through the editor lifecycle.
- [x] 2.4 Wire `markdownDocument.ts` to call `renderMermaidPreview` only for `mermaid` fenced code blocks in `viewer` mode.

## 3. Markdown Image Display

- [x] 3.1 Add `resolveMarkdownImageUrl(src, documentPath)` in `/Users/quanzhou/Workspace/JARVIS/packages/ui/src/utils/markdownDocument.ts`.
- [x] 3.2 Pass remote `http:`/`https:` URLs and `data:image/...` URLs through unchanged.
- [x] 3.3 Resolve local relative Markdown image links against the active Markdown document directory without exposing unrelated local filesystem paths.
- [x] 3.4 Reuse the Milkdown image rendering path where possible instead of adding a second full Markdown parser outside the editor.

## 4. Document Editor Pane UI

- [x] 4.1 Add local `markdownViewerMode` state to `/Users/quanzhou/Workspace/JARVIS/packages/ui/src/components/DocumentEditorPane.vue`, defaulting to `viewer` for Markdown documents.
- [x] 4.2 Add `switchMarkdownViewerMode(nextMode)` that reads current Markdown, emits `update:modelValue`, tears down the editor, updates mode, and recreates the editor.
- [x] 4.3 Render the mode switch in the right side of the Markdown viewer header only for `text/markdown` documents.
- [x] 4.4 Pass `mode` and `documentPath` into `createMarkdownEditor` from `DocumentEditorPane.vue`.
- [x] 4.5 Add shared UI labels in `/Users/quanzhou/Workspace/JARVIS/packages/ui/src/i18n/messages/en.ts` and `/Users/quanzhou/Workspace/JARVIS/packages/ui/src/i18n/messages/zh-CN.ts`.
- [x] 4.6 Add scoped styles for Markdown images, Mermaid preview containers, preview errors, and horizontal overflow while preserving the existing editor surface.

## 5. Tests and Verification

- [x] 5.1 Update `/Users/quanzhou/Workspace/JARVIS/packages/ui/src/components/DocumentEditorPane.test.ts` to cover default `viewer` mode, visible mode switch, mode switching with content preservation, and no Markdown preview switch for non-Markdown text documents.
- [x] 5.2 Add unit coverage for Mermaid preview wiring and image URL resolution in the relevant `packages/ui` utility tests.
- [x] 5.3 Add Playwright E2E coverage for opening a Markdown document with normal Markdown, Mermaid, and image links; verify default `viewer`, switch to `edit`, switch back to `viewer`, and content preservation.
- [x] 5.4 Run `pnpm lint`.
- [x] 5.5 Run `pnpm --filter @packages/ui test`.
- [x] 5.6 Run the relevant build target, at minimum the Web build that exercises `packages/ui`.
- [x] 5.7 Run the targeted Playwright E2E test for the main document viewer.
- [x] 5.8 If extension E2E is used for this change, request elevated permissions, run it with Chromium channel support for MV3, and then run `pnpm --filter extension build` after extension E2E passes.

## 6. PDF Inline Embed

- [x] 6.1 In `/Users/quanzhou/Workspace/JARVIS/packages/ui/src/utils/markdownDocument.ts`, add `injectPdfEmbeds(root, documentPath)` that scans `root` for `<a href="*.pdf">` anchors (case-insensitive), resolves each URL via `resolveMarkdownImageUrl`, creates a `.pdf-inline-embed` `<div>` carrying `data-pdf-embed-src` with a full-width `<iframe>`, and inserts it after the `contenteditable` host element (placing the embed outside ProseMirror's managed DOM). Deduplication is performed by checking `root.querySelector('.pdf-inline-embed[data-pdf-embed-src="<url>"]')` before insertion. The original `<p>` containing the PDF link is hidden via a CSS `:has(a[href$='.pdf' i])` scoped rule in `DocumentEditorPane.vue`, not via inline style.
- [x] 6.2 In `attachMarkdownImageResolution` (viewer mode only), call `injectPdfEmbeds` once via `queueMicrotask` after editor creation, then register a `MutationObserver` on `root` that re-runs `injectPdfEmbeds` with a 100 ms debounce (`setTimeout`) on DOM changes. Disconnect the observer and clear any pending timer when the shared `AbortController` is aborted.
- [x] 6.3 Add `.pdf-inline-embed` (full-width container, `margin: 12px 0`) and `.pdf-inline-embed iframe` (`width: 100%`, `height: 500px`, `border: 0`) scoped styles in `/Users/quanzhou/Workspace/JARVIS/packages/ui/src/components/DocumentEditorPane.vue`.
- [x] 6.4 Add unit tests in `/Users/quanzhou/Workspace/JARVIS/packages/ui/src/utils/markdownDocument.test.ts` verifying that PDF anchors produce injected iframe elements with correctly resolved URLs, re-injection after DOM mutation works without creating duplicates, and that no PDF embeds are injected when the editor is created in `edit` mode.
- [x] 6.5 Add E2E coverage in `/Users/quanzhou/Workspace/JARVIS/apps/web/tests/e2e/knowledge-workspace.spec.ts` for opening `pdf-embed.md`, verifying that an `<iframe>` appears in the document body with an `src` pointing to the correct `document-asset` URL.
- [x] 6.6 Run `pnpm lint`, `pnpm --filter @packages/ui test`, and the targeted E2E spec to confirm all pass.
