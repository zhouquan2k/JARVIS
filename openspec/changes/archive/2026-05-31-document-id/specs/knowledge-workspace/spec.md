English | [Chinese](spec.zh-CN.md)

## ADDED Requirements

### Requirement: Knowledge workspace MUST show a move confirmation dialog before executing any node move
Before executing any move operation (drag-and-drop or context menu), the workspace MUST display a modal confirmation dialog. The dialog MUST show the node being moved and the destination, and MUST warn when outgoing Markdown links will be rewritten. The move MUST NOT be executed until the user explicitly confirms.

#### Scenario: Confirmation dialog appears before intra-agent move
- **WHEN** the user initiates a move (drag-and-drop drop or context-menu "Move to" confirm)
- **AND** the move is within the same agent
- **THEN** the workspace MUST display a confirmation dialog before executing the move
- **AND** the dialog MUST show the name of the node being moved and the destination directory path
- **AND** the dialog MUST provide a "Move" confirm button and a "Cancel" button

#### Scenario: Dialog warns when Markdown links will be rewritten
- **WHEN** the confirmation dialog is shown for moving a `.md` document
- **AND** that document contains relative image or document links
- **THEN** the dialog MUST include a warning that outgoing links in the document will be automatically updated
- **AND** the warning MUST be visible before the user confirms

#### Scenario: Cancel aborts the move
- **WHEN** the confirmation dialog is displayed
- **AND** the user clicks "Cancel" or dismisses the dialog
- **THEN** the move MUST NOT be executed
- **AND** the node MUST remain at its original location

---

### Requirement: Knowledge workspace MUST surface a blocking error dialog when a cross-agent move is attempted
When the user initiates a move that would cross agent boundaries, the workspace MUST replace the confirmation dialog with a blocking error dialog. The error MUST clearly state that cross-agent moves are not supported. The move MUST NOT be executed.

#### Scenario: Error dialog shown instead of confirmation on cross-agent drag-and-drop
- **WHEN** the user drops a node onto a directory belonging to a different agent
- **THEN** the workspace MUST display a blocking error dialog (not a confirmation dialog)
- **AND** the error dialog MUST state that moving across agents is not supported
- **AND** the node MUST remain at its original location

#### Scenario: Error dialog shown on cross-agent context-menu move
- **WHEN** the user selects "Move to" from the file tree context menu
- **AND** the chosen target directory belongs to a different agent
- **THEN** the workspace MUST display the same blocking error dialog
- **AND** the node MUST NOT be moved

#### Scenario: Error dialog is dismissible
- **WHEN** the blocking error dialog is displayed
- **THEN** the user MUST be able to dismiss it with a single action (e.g., "OK" button or Escape key)
- **AND** dismissing the dialog MUST leave the node at its original location

---

### Requirement: Knowledge workspace MUST rewrite outgoing relative links when a document is moved
When a `.md` document is moved within its agent, the workspace MUST rewrite all relative image and document link paths inside that document to remain valid at the new location. Standard relative path syntax (`./`, `../`) MUST be used at all times to preserve compatibility with external Markdown tools. No custom path syntax is introduced.

#### Scenario: Relative image path updated after document move
- **WHEN** the user moves a `.md` document to a different directory within the same agent
- **AND** the document contains relative image references (e.g., `../references/arch.png`)
- **THEN** the workspace MUST rewrite each relative reference so it resolves to the same target file from the new location
- **AND** the rewritten path MUST be a standard relative path valid in any Markdown renderer

#### Scenario: Relative document link updated after document move
- **WHEN** the user moves a `.md` document to a different directory within the same agent
- **AND** the document contains relative links to other documents (e.g., `./notes/setup.md`)
- **THEN** the workspace MUST rewrite those links to remain valid at the new document location

#### Scenario: Rewrite is computed in-memory before writing
- **WHEN** the workspace computes the outgoing link rewrite after a move
- **THEN** the new content MUST be fully computed in memory before any write operation begins
- **AND** if the write fails, the document MUST retain its original content with the original (pre-move) relative paths

#### Scenario: Legacy documents are not auto-rewritten
- **WHEN** a document that has not been moved contains existing relative paths
- **THEN** the workspace MUST NOT rewrite those paths automatically
- **AND** existing relative paths MUST continue to resolve correctly as before

#### Scenario: `references/` directory cannot be moved independently
- **WHEN** the user attempts to move a `references/` directory in isolation (not as part of moving its parent)
- **THEN** the workspace MUST reject the operation with a clear error message
- **AND** the directory MUST remain at its original location
