# document-import-wizard Specification

## Purpose
TBD - created by archiving change document-import-wizard. Update Purpose after archive.
## Requirements
### Requirement: Document import wizard MUST present registered import sources and source-defined configuration
The system MUST provide a document import wizard that lists all registered `DocumentImportContribution` sources and renders the selected source's configuration UI inside the wizard flow. The wizard MUST support a three-step flow of source selection, source configuration, and execution/result.

#### Scenario: Open the wizard and list registered sources
- **WHEN** the user opens the document import wizard from the knowledge workspace
- **THEN** the system MUST display the source-selection step first
- **AND** the wizard MUST list every currently registered document import source with its visible title

#### Scenario: Render the selected source configuration UI
- **WHEN** the user selects a registered import source and proceeds to configuration
- **THEN** the wizard MUST render the source contribution's configuration UI
- **AND** the wizard MUST preserve the source-specific parameter state while the wizard remains open

### Requirement: Document import wizard MUST execute imports in observable stages and stop on failure
The system MUST execute a selected import contribution through observable stages and surface both success and failure to the user. When any stage fails, the wizard MUST stop the import flow and MUST NOT report success.

#### Scenario: Complete a successful transcript-only import
- **WHEN** the user starts a Bilibili import with transcript enabled and summary disabled
- **THEN** the wizard MUST surface staged execution progress that includes transcript fetching, transcript preparation, and document writing
- **AND** the system MUST close the wizard after success and open the created primary document

#### Scenario: Complete a successful transcript-plus-summary import
- **WHEN** the user starts a Bilibili import with summary enabled
- **THEN** the wizard MUST surface staged execution progress that includes transcript fetching, transcript preparation, summary generation, and document writing
- **AND** the system MUST close the wizard after success and open the generated summary document as the primary document

#### Scenario: Stop and report the failing stage
- **WHEN** transcript fetching, summary generation, or document writing fails during an import
- **THEN** the wizard MUST stop the flow immediately
- **AND** the system MUST report the stage that failed to the user

### Requirement: Bilibili import MUST require transcript output and gate summary output on language-model availability
The first import source, Bilibili video import, MUST always generate transcript content and MUST allow summary generation only when at least one shared language-model contribution is available.

#### Scenario: Keep transcript output mandatory
- **WHEN** the user configures a Bilibili import
- **THEN** transcript output MUST remain enabled
- **AND** the user MUST NOT be able to disable transcript generation

#### Scenario: Disable summary when no language model is available
- **WHEN** the system has no registered language-model contribution
- **THEN** the Bilibili import configuration MUST show summary generation as unavailable
- **AND** the user MUST NOT be able to start a summary-enabled import

