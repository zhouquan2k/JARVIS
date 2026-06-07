> **Language**: English | [中文](proposal.zh-CN.md)

## Why

When formatting or inserting links from the Markdown viewer (WYSIWYG) mode, the editor currently routes the operation through a hidden `viewer → edit (raw source) → viewer` round-trip and maps the rendered DOM selection back to raw-source character offsets. This produces two recurring defects: the viewport jumps to the top after a successful edit (reported for the highlight "format brush"), and inserted links land at inaccurate positions because DOM-to-source offset mapping is lossy (duplicate text, empty blocks, lists, tables, frontmatter offsets). These are not isolated bugs but symptoms of one root cause: viewer-mode operations are authored against the raw-source model instead of the live editor the user is actually interacting with.

## What Changes

- Introduce in-place WYSIWYG editing commands for the Markdown viewer mode that apply directly to the live ProseMirror selection, without switching to raw-source edit mode and without rebuilding the editor.
  - Highlight ("format brush") in viewer mode toggles the highlight mark on the current selection. (Prototype already validated.)
  - Link / conversation-link insertion in viewer mode applies a link mark over the current selection (or inserts a labeled link at the caret when there is no selection).
- Viewer-mode formatting/link operations MUST preserve the scroll position / viewport (no jump to top).
- Viewer-mode link insertion MUST apply at the user's actual selection accurately, independent of duplicate text, empty blocks, lists, tables, or frontmatter.
- Raw-source (edit) mode insertion behavior is unchanged.
- **BREAKING (internal mechanism, not user-facing API):** the viewer-mode `viewer → edit → viewer` round-trip and the DOM-selection-to-source-offset mapping subsystem (`prepareMarkdownSelectionFromViewer`, `captureRenderableMarkdownSelection`, `resolveMarkdownSourceSelection`, empty-block fallbacks) are removed for viewer operations once link insertion is migrated.
- Update architecture documentation: reflect the "one semantic command, two native backends (ProseMirror in viewer / textarea source in edit), dispatch by active surface" model in the global class diagram (`workspace.dsl`) and `ARCHITECTURE.zh-CN.md`.

## Capabilities

### New Capabilities
<!-- None. This change refactors existing behavior; no new capability is introduced. The "in-place command / native backend" model is an implementation concern and is documented in design.md, not as a spec capability. -->

### Modified Capabilities
- `knowledge-workspace`: The Markdown link insertion requirement and the Markdown style (highlight) insertion requirement are refined so that, in viewer mode, they apply at the user's live selection, preserve the viewport, and do not round-trip through raw-source mode, while still producing the same serialized Markdown (`[label](href)`, `==...==`).

## Impact

- Code: `packages/ui/src/utils/markdownDocument.ts` (new ProseMirror commands), `packages/ui/src/document-viewers/MarkdownDocumentViewer.vue` (exposed in-place commands, dispatch, scroll-preservation cleanup), `packages/ui/src/components/DocumentEditorPane.vue` (route viewer operations to in-place commands).
- Tests: `packages/ui` unit tests for the affected components/util; e2e coverage for viewer-mode highlight and link insertion (viewport stable + correct position).
- Specs: `knowledge-workspace` (modified).
- Docs: `workspace.dsl` global class diagram and `ARCHITECTURE.zh-CN.md`.
- Dependencies: uses existing `@milkdown/kit/prose/commands` (`toggleMark`) and `editorViewCtx`; no new runtime dependency.
