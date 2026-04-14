English | [中文](spec.zh-CN.md)

## ADDED Requirements

### Requirement: Knowledge workspace Markdown viewer SHALL provide viewer and edit modes
The knowledge workspace main Markdown document viewer SHALL provide a user-visible `viewer` / `edit` mode switch for `text/markdown` documents. The viewer SHALL default to `viewer` mode when opening a Markdown document, and mode switching MUST preserve the current Markdown content, save behavior, and editable document workflow.

#### Scenario: Open a Markdown document in viewer mode by default
- **WHEN** a user opens a `text/markdown` document in the knowledge workspace main pane
- **THEN** the system MUST render the document with the Markdown viewer mode set to `viewer`
- **AND** the mode switch MUST be visible in the main Markdown viewer header

#### Scenario: Switch modes without losing edits
- **WHEN** a user edits Markdown content and switches between `viewer` and `edit`
- **THEN** the system MUST preserve the latest editor Markdown content
- **AND** the save action MUST continue saving the same document content after the switch

#### Scenario: Keep non-Markdown text documents out of Markdown preview controls
- **WHEN** the active text viewer document has `mimeType` other than `text/markdown`
- **THEN** the system MUST NOT require Mermaid or Markdown image preview controls to be shown for that document

### Requirement: Knowledge workspace Markdown viewer SHALL render Mermaid diagrams in viewer mode
The knowledge workspace main Markdown viewer SHALL render fenced code blocks whose language is `mermaid` as diagrams in `viewer` mode by using the official `mermaid` package. In `edit` mode, those same blocks MUST remain visible as editable source text.

#### Scenario: Render a Mermaid code block as a diagram in viewer mode
- **WHEN** a `text/markdown` document contains a fenced code block marked as `mermaid`
- **AND** the Markdown viewer mode is `viewer`
- **THEN** the system MUST display a rendered Mermaid diagram for that block
- **AND** the normal Markdown editing workflow MUST remain available for other document content

#### Scenario: Show Mermaid source in edit mode
- **WHEN** a `text/markdown` document contains a fenced code block marked as `mermaid`
- **AND** the Markdown viewer mode is `edit`
- **THEN** the system MUST display the Mermaid block as editable source text

#### Scenario: Contain Mermaid render failures
- **WHEN** Mermaid rendering fails because the diagram source is invalid or rendering throws an exception
- **THEN** the system MUST keep the document viewer mounted and usable
- **AND** the system MUST show a bounded preview error or fall back to source/empty preview for that block without crashing the workspace pane

### Requirement: Knowledge workspace Markdown viewer SHALL render existing Markdown image links
The knowledge workspace main Markdown viewer SHALL display existing Markdown image links as images in `viewer` mode. Supported image sources MUST include remote URLs, `data:image/...` URLs, and local relative paths resolved from the active Markdown document directory.

#### Scenario: Render remote Markdown image links
- **WHEN** a `text/markdown` document contains a Markdown image link whose source is an `http:` or `https:` URL
- **AND** the Markdown viewer mode is `viewer`
- **THEN** the system MUST display the linked image in the document body

#### Scenario: Render data URL Markdown image links
- **WHEN** a `text/markdown` document contains a Markdown image link whose source starts with `data:image/`
- **AND** the Markdown viewer mode is `viewer`
- **THEN** the system MUST display the embedded image in the document body

#### Scenario: Resolve relative Markdown image links from the active document directory
- **WHEN** a `text/markdown` document at `/notes/guide.md` contains a Markdown image link such as `![diagram](./images/flow.png)`
- **AND** the Markdown viewer mode is `viewer`
- **THEN** the system MUST resolve the image path relative to `/notes/`
- **AND** the system MUST use the workspace document loading path or host-compatible URL path to display the image without exposing unrelated local filesystem paths

#### Scenario: Avoid adding image asset management features
- **WHEN** a user views or edits a Markdown document with image links
- **THEN** the system MUST NOT require new upload, paste-to-file, drag-and-drop import, or standalone image asset management behavior for this change

### Requirement: Knowledge workspace Markdown viewer SHALL render wiki-style PDF embeds as inline previews
The knowledge workspace main Markdown viewer SHALL display wiki-style PDF embeds (`![[file.pdf]]`) and standard Markdown image syntax pointing to `.pdf` files as inline `<iframe>` PDF previews in the document body in `viewer` mode, matching the Obsidian embed experience. The PDF source MUST be resolved through the same document-relative path resolution used for other assets.

#### Scenario: Render a wiki-style PDF embed as an inline iframe in viewer mode
- **WHEN** a `text/markdown` document contains a wiki-style embed `![[file.pdf]]`
- **AND** the Markdown viewer mode is `viewer`
- **THEN** the system MUST render an `<iframe>` in the document body at the position of the embed
- **AND** the iframe `src` MUST resolve to the correct `document-asset` URL for the PDF file

#### Scenario: Render standard Markdown image syntax pointing to a PDF as an inline iframe
- **WHEN** a `text/markdown` document contains `![alt](path/to/file.pdf)`
- **AND** the Markdown viewer mode is `viewer`
- **THEN** the system MUST render an `<iframe>` in the document body rather than a broken image or plain link

#### Scenario: PDF embed does not appear in edit mode
- **WHEN** a `text/markdown` document contains a wiki-style PDF embed or a Markdown image link pointing to a `.pdf` file
- **AND** the Markdown viewer mode is `edit`
- **THEN** the system MUST NOT inject inline PDF iframes; the source text remains editable as-is

#### Scenario: PDF embed survives external content sync
- **WHEN** an inline PDF embed has been injected into the document body
- **AND** external content sync causes ProseMirror to reconcile the DOM
- **THEN** the system MUST re-inject the PDF embed so it remains visible to the user

### Requirement: Knowledge workspace Markdown viewer SHALL preserve existing viewer boundaries
The Mermaid and image preview behavior SHALL apply only to the main knowledge workspace Markdown document viewer. Chat-message Markdown rendering, PDF viewing, unsupported viewer handling, diff display, undo/redo, and document registry resolution MUST keep their existing responsibilities.

#### Scenario: Leave chat message Markdown rendering unchanged
- **WHEN** a chat message is rendered through the chat Markdown renderer
- **THEN** this change MUST NOT require the chat message renderer to use the main document viewer Mermaid or image preview implementation

#### Scenario: Preserve PDF and unsupported document behavior
- **WHEN** the active document is a PDF or an unsupported MIME type
- **THEN** the system MUST keep using the existing PDF viewer or unsupported viewer state
- **AND** the Markdown viewer mode switch MUST NOT replace those viewer paths

#### Scenario: Preserve file change diff and undo redo controls
- **WHEN** a Markdown document has a latest file change record
- **AND** the user switches between `viewer` and `edit`
- **THEN** the system MUST keep the file change diff and undo/redo controls governed by the existing document pane behavior
