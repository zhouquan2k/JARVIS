## ADDED Requirements

### Requirement: Knowledge workspace MUST automatically title new Agent-pane conversations from the first question
The knowledge workspace MUST apply the same first-question automatic naming behavior to local conversations created from the right-side Agent pane. Generated titles MUST persist on the local conversation and MUST appear in the Agent conversation list and conversation detail header after the first successful send.

#### Scenario: Title a newly created Agent conversation after the first send
- **WHEN** the user creates a new local conversation from the Agent pane in the knowledge workspace
- **AND** that conversation still has the placeholder title `New Chat`
- **AND** the first user question is sent successfully
- **THEN** the system MUST generate a concise title from that first question
- **AND** the system MUST persist and display that generated title in the Agent-pane conversation surfaces

#### Scenario: Fall back locally when provider-side title generation is unavailable
- **WHEN** the Agent-pane conversation first send succeeds
- **AND** the active provider cannot generate a title or title generation fails
- **THEN** the system MUST keep the successful assistant response
- **AND** the system MUST apply a deterministic local fallback title to the conversation

### Requirement: Knowledge workspace MUST normalize Markdown filenames in AgentMode file trees
The knowledge workspace AgentMode file tree MUST treat Markdown filenames as a display concern: new file creation MUST append `.md` when the user does not provide an extension, file tree labels MUST hide the `.md` suffix by default, and non-Markdown files MUST show a file-type icon in the tree. This behavior MUST not change the underlying filesystem path or document identity.

#### Scenario: Auto-append `.md` when creating a new Markdown file
- **WHEN** the user creates a new file from the AgentMode file tree
- **AND** the entered name does not include a filename extension
- **THEN** the system MUST create the file with a `.md` suffix
- **AND** the created node MUST resolve to the Markdown document path in the workspace

#### Scenario: Hide `.md` in the default display name
- **WHEN** the AgentMode file tree renders a Markdown file node
- **THEN** the displayed label MUST hide the `.md` suffix by default
- **AND** the underlying node path MUST remain unchanged

#### Scenario: Show file-type icons for non-Markdown files
- **WHEN** the AgentMode file tree renders a non-Markdown file node
- **THEN** the tree MUST display a file-type icon for that node
- **AND** the node label MUST keep the original filename

### Requirement: Knowledge workspace MUST provide a Markdown link insertion UI for existing Agent-scope documents
The knowledge workspace Markdown editor MUST let users insert links to existing Markdown documents through a UI chooser instead of requiring manual Markdown syntax entry. The chooser MUST reuse the current Agent-scope Markdown document collection, and inserted links MUST target the chosen document with a relative Markdown path.

#### Scenario: Insert a link from the editor toolbar chooser
- **WHEN** the user is editing a Markdown document in the knowledge workspace
- **AND** the current Agent scope contains at least one other Markdown document
- **THEN** the editor MUST offer a link insertion UI entry
- **AND** choosing a target document MUST insert Markdown link syntax for that document at the current cursor position

#### Scenario: Wrap the current selection when inserting a chosen link
- **WHEN** the user has selected text in the Markdown editor
- **AND** the user chooses an existing Markdown document from the link insertion UI
- **THEN** the editor MUST preserve the selected text as the link label
- **AND** the inserted href MUST point to the chosen document using a relative path from the active document

#### Scenario: Exclude the active document from link choices
- **WHEN** the link insertion UI lists candidate Markdown documents
- **THEN** the active document being edited MUST NOT appear as a selectable target

### Requirement: Knowledge workspace MUST support viewer-mode resizing for local Markdown images
The knowledge workspace Markdown middle-pane viewer MUST let users resize local document images directly from the rendered viewer mode without depending on a new editor-native image sizing contract. The resize interaction MUST persist the chosen Crepe-compatible ratio back into the authored Markdown source and MUST leave unsupported image sources unchanged.

#### Scenario: Resize a local Markdown image from the viewer surface
- **WHEN** the user opens a Markdown document in knowledge workspace viewer mode
- **AND** the rendered content contains a local document image that originated from standard Markdown image syntax or wiki-style image embed syntax
- **THEN** the viewer MUST expose a resize affordance for that image
- **AND** dragging the affordance MUST update the preview width visually
- **AND** releasing the drag MUST persist the selected ratio back into the document source

#### Scenario: Persist ratio through HTML image syntax
- **WHEN** the user completes a resize interaction for a local Markdown image
- **THEN** the system MUST persist the image ratio using an authored representation that preserves the selected scale
- **AND** if the source image is already represented as an HTML `<img>` tag or wiki embed, the system MUST normalize it into the same ratio-based representation instead of duplicating the image entry

#### Scenario: Do not persist ambiguous or unsupported image sources
- **WHEN** the rendered image source cannot be mapped back to a unique source span in the active Markdown document
- **OR** the rendered image uses a remote URL or `data:` URL source
- **THEN** the viewer MUST NOT rewrite the Markdown source automatically
- **AND** the rest of the Markdown viewing experience MUST continue to work without document corruption

### Requirement: Knowledge workspace MUST materialize pasted Markdown images as `references/` files
When a user pastes an image into a Markdown document in the knowledge workspace, the system MUST store that image as a real file under a document-local `references/` directory and MUST insert a Markdown reference to the stored file instead of inlining the image bytes into the document source.

#### Scenario: Paste an image into a Markdown document
- **WHEN** the user pastes an image from the clipboard into an editable Markdown document
- **THEN** the system MUST create or reuse a `references/` directory relative to the active document
- **AND** the system MUST write the pasted image to a file in that directory
- **AND** the system MUST insert Markdown image syntax that references the stored file instead of embedding a `data:` URL in the document

#### Scenario: Keep pasted-image references document-relative
- **WHEN** the system inserts the Markdown reference for a newly pasted image
- **THEN** the inserted path MUST remain relative to the active Markdown document
- **AND** the referenced file MUST resolve through the existing Markdown asset path rules used by the knowledge workspace viewer

#### Scenario: Do not corrupt the document when pasted-image persistence fails
- **WHEN** the image file cannot be written under `references/` for the active document
- **THEN** the system MUST NOT replace the current document content with a large inline image payload automatically
- **AND** the existing Markdown editor content MUST remain intact
