English | [中文](proposal.zh-CN.md)

## Why

The main Markdown viewer currently treats Mermaid blocks and Markdown image links primarily as editable source text, which makes diagram-heavy workspace documents harder to read and validate in place. This change adds a viewer-first mode for the knowledge workspace Markdown document viewer while preserving the existing editable Milkdown workflow and keeping chat-message Markdown rendering out of scope.

## What Changes

- Add a `viewer` / `edit` mode switch to the main Markdown viewer header, defaulting new viewer sessions to `viewer`.
- In `viewer` mode, render fenced `mermaid` code blocks through the official `mermaid` package while keeping normal Markdown editable.
- In `edit` mode, keep Mermaid code blocks in source-editing form so users can modify diagram definitions directly.
- Render existing Markdown image links as images in `viewer` mode, including remote URLs, `data:image/...` URLs, and local relative paths resolved from the active document location.
- In `viewer` mode, render wiki-style PDF embeds (`![[file.pdf]]`) as inline `<iframe>` previews inside the document body, matching the Obsidian embed experience. Standard Markdown image syntax pointing to `.pdf` files is treated the same way.
- Preserve the current save, autosave, diff, undo/redo, and document viewer registry behavior.
- Do not change `MarkdownContent.vue` or chat-message Markdown rendering.
- Do not add image upload, paste-to-file, drag-and-drop image import, or standalone image asset management.

## Capabilities

### New Capabilities
- `<none>`: The change extends an existing knowledge workspace document viewer behavior rather than creating a separate product capability.

### Modified Capabilities
- `knowledge-workspace`: Adds main Markdown viewer requirements for viewer/edit mode switching, Mermaid preview rendering, Markdown image display, and scoped relative image resolution.

## Impact

- Affects `packages/ui/src/components/DocumentEditorPane.vue` for the viewer/edit mode UI, editor lifecycle switching, and inline PDF embed styles.
- Affects `packages/ui/src/utils/markdownDocument.ts` for Milkdown Crepe creation, CodeMirror preview configuration, image rendering support, and DOM-based PDF embed injection.
- Adds a focused Mermaid preview utility, expected under `packages/ui/src/utils/`, to isolate Mermaid initialization and render failure handling.
- May affect document path handling in the UI layer so local relative image links resolve against the active Markdown document directory.
- Adds the official `mermaid` runtime dependency if it is not already present.
- Requires targeted workspace document viewer regression tests; extension E2E, if used, must run with elevated permissions and Chromium channel support for MV3.
