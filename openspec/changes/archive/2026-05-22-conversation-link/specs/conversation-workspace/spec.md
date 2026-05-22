## ADDED Requirements

### Requirement: Conversation workspace MUST open externally requested Agent conversations in detail mode
The conversation workspace MUST allow the right-side Agent conversation surface to honor an external request to open a local conversation from workspace navigation. When such a request is valid, the surface MUST select the requested conversation and present its detail view even if it is currently showing the Agent conversation list.

#### Scenario: Open a requested conversation while the panel is in list mode
- **WHEN** the right-side Agent pane is currently showing the Agent conversation list
- **AND** the workspace issues a valid request to open a local conversation in the current Agent scope
- **THEN** the conversation workspace MUST select that conversation
- **AND** the right-side surface MUST switch to the requested conversation detail view

#### Scenario: Replace the current detail conversation with the requested target
- **WHEN** the right-side Agent pane is already showing a different conversation detail
- **AND** the workspace issues a valid request to open another local conversation in the current Agent scope
- **THEN** the conversation workspace MUST switch the active conversation to the requested target
- **AND** the right-side surface MUST continue showing detail mode for the new target

#### Scenario: Ignore invalid requests without destabilizing the panel
- **WHEN** the workspace issues a request for a conversation that is missing, deleted, or outside the current Agent scope
- **THEN** the conversation workspace MUST leave the current panel selection unchanged
- **AND** the right-side surface MUST remain stable in its current list or detail state
