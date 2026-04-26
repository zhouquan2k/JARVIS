## ADDED Requirements

### Requirement: Conversation workspace MUST expose archive only for agent-bound Markdown documents
The conversation workspace MUST expose an archive action in `NormalChatView` only when the workspace is in agent mode and the currently selected node is the active writable Markdown document. The action MUST NOT be shown for normal chat mode, compare mode, external preview mode, directory selections, non-Markdown files, or read-only documents.

#### Scenario: Show archive action for the active agent Markdown document
- **WHEN** `chatStore.workspaceMode` is `agent`
- **AND** the selected node path matches the active document path
- **AND** the active document MIME type is `text/markdown`
- **AND** the active document is writable
- **THEN** the system MUST render an archive action in `NormalChatView`

#### Scenario: Hide archive action outside eligible archive context
- **WHEN** the workspace is not in agent mode, or the selected node is not the active writable Markdown document
- **THEN** the system MUST NOT render the archive action

### Requirement: Conversation workspace MUST archive without confirmation and preserve chat continuity
When the user triggers archive from an eligible agent conversation, the system MUST execute the archive immediately without a preview-confirmation step. The workspace MUST keep the current conversation view active and provide lightweight completion feedback instead of switching to a dedicated archive preview mode.

#### Scenario: Archive runs immediately from the chat action
- **WHEN** the user clicks the archive action in an eligible agent conversation
- **THEN** the system MUST start the archive operation immediately
- **AND** the system MUST NOT require a preview confirmation before writing the merged document

#### Scenario: Preserve current chat view after archive
- **WHEN** an archive operation succeeds, produces no change, or fails
- **THEN** the system MUST keep the current conversation view mounted
- **AND** the system MUST provide non-blocking success, no-change, or failure feedback in the chat workspace

### Requirement: Conversation workspace MUST display persisted archive state for the current conversation
The conversation workspace MUST show the current conversation's persisted archive state in the chat UI whenever the archive action is relevant, so users can tell whether the conversation has never been archived, is archived and current, or has become stale.

#### Scenario: Show archived status after a successful archive
- **WHEN** the current eligible agent conversation has persisted archive metadata and no later visible messages beyond the archived snapshot
- **THEN** the system MUST display an archived status indicator in `NormalChatView`

#### Scenario: Show stale status after new turns arrive
- **WHEN** the current eligible agent conversation has persisted archive metadata and later gains additional visible messages
- **THEN** the system MUST display a stale archive status indicator in `NormalChatView`

#### Scenario: Show unarchived status before the first archive
- **WHEN** the current eligible agent conversation has no persisted archive metadata
- **THEN** the system MUST display an unarchived status indicator in `NormalChatView`
