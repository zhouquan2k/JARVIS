## ADDED Requirements

### Requirement: Agent view MUST provide a tabbed right-side workspace container
The Agent view MUST provide a tabbed right-side workspace container that hosts both conversation workflows and task workflows for the current workspace selection.

#### Scenario: Render the right-side container for a document selection
- **WHEN** the shared document workspace has an active document selection with Agent context
- **THEN** the Agent view MUST render a right-side workspace container for that selection
- **AND** that container MUST provide both conversation and task tabs

#### Scenario: Render the right-side container for an agent-owner selection
- **WHEN** the shared document workspace has an agent-owner/project selection without an active document
- **THEN** the Agent view MUST render the same right-side workspace container for that selection
- **AND** the available task behavior MUST remain scoped to that same selection
