## ADDED Requirements

### Requirement: Knowledge workspace MUST expose viewer-level search with Markdown implementation
The knowledge workspace MUST expose search through a viewer-level interface so future document viewers can implement scoped search. In this change, only the Markdown viewer MUST implement in-document keyword search. The search MUST be opened by `Ctrl+F` or `Cmd+F` when the active viewer supports search, MUST highlight matches within the active viewer, and MUST support previous/next match navigation.

#### Scenario: Open Markdown document search with keyboard shortcut
- **WHEN** a Markdown document is active and the user presses `Ctrl+F` or `Cmd+F`
- **THEN** the system MUST open the Markdown search control in the document pane
- **AND** the system MUST scope search behavior to the active Markdown document

#### Scenario: Highlight and navigate matches
- **WHEN** the user enters a non-empty search query with matches in the active Markdown document
- **THEN** the system MUST highlight the matches in the viewer
- **AND** the user MUST be able to move to the next and previous match

#### Scenario: Leave non-Markdown browser search behavior intact
- **WHEN** the active viewer does not implement the viewer search interface
- **THEN** the system MUST NOT intercept the browser find shortcut for document viewer search

#### Scenario: Future viewers can implement search through the same interface
- **WHEN** a future non-Markdown viewer implements the viewer search interface
- **THEN** the document pane MUST be able to drive search query updates, match count reads, and previous/next navigation through that interface
- **AND** the future viewer MUST own its own highlighting and scrolling behavior

### Requirement: Knowledge workspace save button MUST reflect active document dirty state
The knowledge workspace document save button MUST visually distinguish clean, dirty, and saving states for writable text documents using the active document's canonical dirty state.

#### Scenario: Show dirty save state
- **WHEN** the active writable text document has unsaved local edits
- **THEN** the save button MUST render with a dirty visual state
- **AND** its accessible label or tooltip MUST communicate that unsaved changes exist

#### Scenario: Show saving state
- **WHEN** the active document save operation is running
- **THEN** the save button MUST render with a saving visual state
- **AND** the button MUST remain disabled until the save operation completes

### Requirement: Knowledge workspace MUST show Agent folder index document when present
When an Agent owner directory is selected, the knowledge workspace MUST open an existing `index.md` in that directory as the main document while preserving the selected directory as the active Agent scope. The system MUST NOT create `index.md` automatically.

#### Scenario: Show index document for Agent owner directory
- **WHEN** the user selects an Agent owner directory that contains `index.md`
- **THEN** the system MUST open that `index.md` in the main document pane
- **AND** the active Agent context MUST continue to resolve from the selected directory

#### Scenario: Keep Agent view when index document is absent
- **WHEN** the user selects an Agent owner directory that does not contain `index.md`
- **THEN** the system MUST keep showing `AgentView` in the main pane
- **AND** the system MUST NOT create a new `index.md`

### Requirement: Knowledge workspace MUST serve as the file-resolution source for `@filename`
The knowledge workspace MUST allow the chat send pipeline to resolve `@filename` references against the effective Agent context for the conversation. If the conversation is bound to an Agent, resolution MUST use that Agent scope; otherwise it MUST use the default active Agent scope. Resolution MUST prefer exact basename matches; when basename alone is ambiguous within that Agent scope, the system MAY accept a unique path-suffix match. Only documents that can be safely read as text MAY be injected as prompt sections.

#### Scenario: Resolve a unique basename from the effective Agent context
- **WHEN** chat input contains `@guide.md` and the current Agent context contains exactly one file with that basename
- **THEN** the system MUST resolve the reference to that unique file

#### Scenario: Allow unique path-suffix resolution when basenames collide
- **WHEN** multiple files inside the current Agent context share the same basename and the user's reference uniquely matches one path suffix
- **THEN** the system MUST resolve the reference to that unique path

#### Scenario: Do not inject non-text files as prompt sections
- **WHEN** an `@filename` reference resolves to a non-text document
- **THEN** the system MUST block that prompt-section injection
- **AND** the system MUST return a clear error instead of appending binary content to the prompt
