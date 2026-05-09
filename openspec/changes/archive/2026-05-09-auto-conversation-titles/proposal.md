## Why

New conversations currently start as `New Chat` and only derive a title from a raw first-prompt truncation. That behavior is too literal, does not stay concise for long questions, and does not define how Agent-mode conversations should be named. We need a shared contract so every newly created conversation gets a short, question-aware title without adding noticeable latency or token waste.

In the knowledge workspace, Markdown editing still requires users to hand-author Markdown link syntax. That makes internal document linking slower and more error-prone than it needs to be, especially when the target already exists under the current Agent scope. We need a lightweight UI affordance that lets users insert document links from a chooser instead of manually typing Markdown.

In the same knowledge-workspace Markdown viewer path, image rendering is still effectively read-only beyond the existing edit/view toggle. Users cannot visually size local images the way tools like Obsidian allow, so correcting an oversized rendered image still requires manual source edits. We need a viewer-mode resize affordance that lets users drag local Markdown images to a chosen width and persists that width back into the document source.

The current Markdown authoring path also risks making documents noisy when users paste images inline as `data:` URLs or editor-managed embeds. We want pasted images to be materialized as real files under a document-local `references/` directory and referenced from Markdown, so the document stays readable and image assets stay manageable.

## What Changes

- Add automatic title generation for newly created local conversations after the first user question is sent, covering both normal conversation mode and Agent-mode conversations.
- Regenerate the title when the user edits and resends the first visible question, but do not overwrite later manual renames during ordinary follow-up turns.
- Extend shared provider contracts with an optional conversation-title generation capability.
- Require provider implementations to use a low-cost, non-thinking model for title generation instead of inheriting the active conversation model or reasoning level.
- Add deterministic local fallback title rules so title-generation failure does not block the main message send flow.
- Persist the generated title through the existing conversation storage, sidebar lists, and restored conversation detail views.
- In AgentMode file trees, automatically append `.md` when creating a new Markdown file, hide the `.md` suffix in default labels, and show file-type icons for non-Markdown files.
- In Markdown edit mode, add a knowledge-workspace link insertion affordance that lets users choose from existing Agent-scope Markdown documents and inserts Markdown link syntax automatically.
- In Markdown viewer mode, add a local-image resize affordance that lets users drag to change rendered width and persists the chosen width back into the Markdown source.
- When pasting an image into a Markdown document, store the image as a file under `references/` and insert a Markdown reference to that file instead of embedding image data inline.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `conversation-workspace`: Automatically name newly created local conversations from the first user question and regenerate the title when the first visible question is edited and resent.
- `knowledge-workspace`: Apply the same automatic naming behavior to Agent-pane conversations created from the knowledge workspace, update AgentMode file tree presentation so Markdown filenames hide `.md` by default while non-Markdown files show type icons, and add a Markdown link insertion UI that reuses the current Agent-scope document collection.
- `knowledge-workspace`: In the Markdown middle-pane viewer, allow local Markdown images to be resized visually in viewer mode and persist the authored width back into the document.
- `knowledge-workspace`: In Markdown authoring, materialize pasted images as `references/` files and reference them from the document instead of inlining image data.
- `core-interfaces`: Add an optional provider capability for generating short conversation titles independently from normal message sending.
- `chatgpt-web-provider`: Support low-cost provider-side title generation through the shared title-generation capability.
- `gemini-api-provider`: Support low-cost provider-side title generation through the shared title-generation capability.

## Impact

- Affected shared UI/store path: `packages/ui/src/store/chat.ts` and related title helper utilities.
- Affected AgentMode presentation paths: `DocumentFileTree`, `AgentDocumentTree`, `DocumentEditorPane`, `MarkdownDocumentViewer`, and the workspace display helpers used by file tree rendering.
- Affected Markdown authoring/viewer paths: `DocumentEditorPane`, `MarkdownDocumentViewer`, and `packages/ui/src/utils/markdownDocument.ts` for viewer-mode image enhancement and Markdown rewrite helpers.
- Affected image persistence path: Markdown editor paste handling plus the context-provider write path used to create `references/` image files next to the active document.
- Affected shared core contracts: `IModelProvider` and any proxy message/result protocol used by desktop and extension hosts.
- Affected provider implementations: ChatGPT Web, Gemini API, and host proxies that forward provider capabilities.
- No new external dependency is expected; the change reuses existing provider access paths and local conversation persistence.
