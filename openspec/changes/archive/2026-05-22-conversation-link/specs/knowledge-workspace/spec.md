## ADDED Requirements

### Requirement: Knowledge workspace MUST provide a Markdown conversation-link insertion UI for current Agent conversations
The knowledge workspace Markdown editor MUST provide a dedicated conversation-link insertion action for Markdown documents. The chooser MUST reuse local conversations from the current Agent scope, and the inserted Markdown href MUST identify only the chosen conversation.

#### Scenario: Insert a conversation link from the toolbar chooser
- **WHEN** the user is editing a Markdown document in the knowledge workspace
- **AND** the current Agent scope has at least one local conversation
- **THEN** the editor MUST expose a conversation-link insertion action
- **AND** choosing a conversation MUST insert Markdown link syntax for that conversation at the current cursor position

#### Scenario: Wrap the current selection when inserting a chosen conversation link
- **WHEN** the user has selected text in the Markdown editor
- **AND** the user chooses a conversation from the conversation-link insertion UI
- **THEN** the editor MUST preserve the selected text as the link label
- **AND** the inserted href MUST encode only the target conversation identity rather than any question-level location

#### Scenario: Disable the action when no local conversations are linkable
- **WHEN** the user is editing a Markdown document in the knowledge workspace
- **AND** the current Agent scope has no local conversations that can be linked
- **THEN** the conversation-link insertion action MUST remain unavailable for insertion
- **AND** the editor MUST NOT force the user to hand-author an application conversation href

### Requirement: Knowledge workspace MUST route clicked Markdown conversation links to the right-side Agent pane
When a rendered Markdown link resolves to a workspace conversation href, the knowledge workspace MUST treat it as an internal conversation navigation action. Opening the linked conversation MUST NOT replace the active middle-pane document.

#### Scenario: Open a linked conversation from the Markdown viewer
- **WHEN** the user clicks a rendered Markdown link that identifies a local conversation in the current Agent scope
- **THEN** the workspace MUST request that the right-side Agent pane open that conversation
- **AND** the current active document in the middle pane MUST remain open

#### Scenario: Ignore unsupported or unavailable conversation links safely
- **WHEN** the user clicks a rendered Markdown link whose conversation target is unavailable, deleted, or outside the current Agent scope
- **THEN** the workspace MUST NOT replace the active document
- **AND** the workspace MUST NOT corrupt the current conversation or document state
