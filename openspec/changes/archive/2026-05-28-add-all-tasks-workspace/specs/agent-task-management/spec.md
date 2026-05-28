## MODIFIED Requirements

### Requirement: Agent task management MUST scope task lists to the current selection only
The task tab MUST resolve tasks from exactly one scope at a time. When the current selection is a document, the task tab MUST show only tasks bound to that document. When the current selection is a project/agent-owner scope with no active document, the task tab MUST show only tasks bound directly to that project scope. The same task-list interaction model MUST also remain reusable by non-Agent workspace surfaces without changing these scoped-query rules for the Agent task tab itself.

#### Scenario: Show only document tasks for an active document
- **WHEN** the current workspace selection has an active document path
- **THEN** the task tab MUST query and render only tasks associated with that document path
- **AND** it MUST NOT mix in project-scoped tasks or tasks from other documents

#### Scenario: Show only project tasks for an active project scope
- **WHEN** the current workspace selection is an agent-owner/project scope and no document is active
- **THEN** the task tab MUST query and render only tasks associated directly with that project scope
- **AND** it MUST NOT mix in document-scoped tasks from the same project

#### Scenario: Reuse the same task-list interactions outside the Agent task tab
- **WHEN** another workspace surface reuses the shared task-list component for a different scope selection
- **THEN** the shared task-list interactions MUST remain behaviorally consistent with the Agent task tab
- **AND** the Agent task tab MUST continue to preserve its own current-scope-only query behavior

