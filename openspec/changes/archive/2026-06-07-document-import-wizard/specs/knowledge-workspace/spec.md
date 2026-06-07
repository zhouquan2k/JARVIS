## ADDED Requirements

### Requirement: Knowledge workspace MUST expose a document import entry alongside document creation
The knowledge workspace document tree MUST expose a document import entry next to the existing new-document entry so users can start a plugin-driven import flow from their current workspace context.

#### Scenario: Open the import wizard from the document tree
- **WHEN** the user clicks the document import entry in the document tree toolbar
- **THEN** the workspace MUST open the document import wizard
- **AND** the wizard MUST default its target directory to the currently selected directory when one is available

#### Scenario: Change the target directory before import
- **WHEN** the user is configuring an import in the wizard
- **THEN** the workspace MUST allow the user to change the target directory before execution
- **AND** the selected target directory MUST be passed into the invoked import contribution

### Requirement: Knowledge workspace MUST organize transcript and summary outputs according to import result shape
When a document import produces transcript content only, the workspace MUST create a normal Markdown document in the selected target directory. When a document import produces both transcript and summary content, the workspace MUST treat the summary as the primary document and MUST place the transcript under the primary document's `references/` directory as a referenced resource.

#### Scenario: Persist transcript-only output as a normal document
- **WHEN** a completed import returns transcript content without summary content
- **THEN** the workspace MUST create the transcript as a normal Markdown document in the selected target directory
- **AND** the created transcript document MUST be opened as the primary document after success

#### Scenario: Persist transcript-plus-summary output with transcript as a reference resource
- **WHEN** a completed import returns both transcript and summary content
- **THEN** the workspace MUST create the summary document in the selected target directory
- **AND** the workspace MUST create the transcript under that summary document's `references/` directory as a referenced resource
- **AND** the summary document MUST link to the transcript resource

### Requirement: Knowledge workspace MUST keep failed imports from leaving user-visible success state
When an import fails before completion, the knowledge workspace MUST keep the wizard in a failed state, surface an error to the user, and MUST NOT present the import as successful.

#### Scenario: Report transcript-fetch failure without success navigation
- **WHEN** a Bilibili import fails while fetching transcript data
- **THEN** the workspace MUST surface an error message for the failed import
- **AND** the workspace MUST NOT close the wizard as a success case or open a primary document

#### Scenario: Report summary-generation failure without partial-success messaging
- **WHEN** a summary-enabled import fails while generating summary content
- **THEN** the workspace MUST surface an error message for the failed stage
- **AND** the workspace MUST NOT present a success toast for the import
