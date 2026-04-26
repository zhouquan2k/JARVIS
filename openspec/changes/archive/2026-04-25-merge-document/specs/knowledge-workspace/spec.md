## ADDED Requirements

### Requirement: Knowledge workspace MUST merge an eligible agent conversation into the active Q/A document
The knowledge workspace MUST support archiving the full visible message history of the current eligible agent conversation into the active writable Markdown document. The archive operation MUST treat the document as a single Q/A file, merge user messages into the `Q` section, merge assistant messages into the `A` section, and keep only the latest effective content when older paragraphs are superseded.

#### Scenario: Archive the full visible conversation into the active document
- **WHEN** the user triggers archive for an eligible agent conversation bound to the active writable Markdown document
- **THEN** the system MUST use the full visible conversation as the archive input
- **AND** the system MUST merge user messages only into `Q`
- **AND** the system MUST merge assistant messages only into `A`

#### Scenario: Ignore deleted messages during archive
- **WHEN** the current conversation contains soft-deleted messages
- **THEN** the system MUST exclude those deleted messages from the archive input

### Requirement: Knowledge workspace MUST split Q and A by the first standard markdown divider
The knowledge workspace archive flow MUST identify the top-level `Q` / `A` boundary using only the first Markdown standard horizontal divider in the active document. If the document does not contain such a divider, the system MUST append `---` at the end of the document before producing the merged result. `***` MUST NOT be treated as the archive divider.

#### Scenario: Split Q and A by the first valid divider
- **WHEN** the active Markdown document contains one or more valid Markdown standard dividers
- **THEN** the system MUST use only the first such divider as the top-level `Q` / `A` boundary
- **AND** later dividers MUST remain part of normal document content

#### Scenario: Insert divider when the document has no archive boundary
- **WHEN** the active Markdown document does not contain a valid archive divider
- **THEN** the system MUST append `---` to establish the `Q` / `A` boundary before merging archived content

#### Scenario: Ignore triple-asterisk divider for archive boundary detection
- **WHEN** the active Markdown document contains `***` but no other valid archive divider
- **THEN** the system MUST NOT treat `***` as the archive boundary
- **AND** the system MUST still append `---` before merging archived content

### Requirement: Knowledge workspace MUST preserve diff and undo semantics for archive writes
Archive writes in the knowledge workspace MUST flow through the existing file change history pipeline rather than bypassing it with a direct document overwrite. The merged result MUST become a normal workspace file change so the user can inspect the diff and use undo/redo to revert or restore the archive result.

#### Scenario: Archive write appears as a normal file change
- **WHEN** an archive operation produces a changed document
- **THEN** the system MUST record the archive result through the workspace file change service
- **AND** the latest file change diff MUST reflect the archive result

#### Scenario: Undo and redo an archive result
- **WHEN** the user triggers undo or redo after a successful archive write
- **THEN** the system MUST restore the pre-archive or post-archive document content through the existing workspace undo/redo flow

#### Scenario: Skip write when archive produces no new content
- **WHEN** an archive operation produces a merged document that is identical to the current active document
- **THEN** the system MUST NOT write the document
- **AND** the system MUST report that no new content was archived

### Requirement: Knowledge workspace MUST persist archive state on the local conversation
When an eligible archive succeeds, the knowledge workspace MUST persist archive metadata on the current local conversation so the archive state survives reload and conversation re-selection.

#### Scenario: Persist archive metadata after a successful archive
- **WHEN** an archive operation successfully writes a changed or unchanged merged result for the current local conversation
- **THEN** the system MUST persist archive metadata on that conversation
- **AND** the metadata MUST include at least the archived document path and a snapshot marker that can detect later conversation growth

#### Scenario: Mark a conversation stale after new turns are added
- **WHEN** a conversation has persisted archive metadata and later receives additional visible messages
- **THEN** the system MUST mark the conversation archive state as stale
- **AND** the previously persisted archive metadata MUST remain available for UI display
