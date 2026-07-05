English | [Chinese](spec.zh-CN.md)

## ADDED Requirements

### Requirement: Panel and full-screen chat MUST provide symmetric toggle buttons
The right-panel (`AgentConversationPanel`) already has an "expand to full-screen" button. The full-screen chat view (`NormalChatView`) SHALL expose a symmetric "collapse to panel" button. Both buttons SHALL use consistent icon language and placement so users can toggle between the two views in either direction.

#### Scenario: Expand from panel to full-screen
- **WHEN** the user clicks the expand button in the right-panel toolbar
- **THEN** the system MUST navigate to the full-screen chat route (`/chat`)
- **AND** the same conversation MUST remain active

#### Scenario: Collapse from full-screen to panel
- **WHEN** the user clicks the collapse button in the full-screen chat header
- **THEN** the system MUST navigate back to the workspace route (`/`)
- **AND** the same conversation MUST remain active

#### Scenario: Buttons use consistent icon language
- **WHEN** either toggle button is rendered
- **THEN** the expand and collapse buttons MUST use visually paired icons (e.g., expand/compress)
- **AND** both MUST have descriptive tooltip/aria-label text

### Requirement: Switching to a conversation with associated documents MUST auto-open the first document
When the active conversation changes and the new conversation has a non-empty `documentIds` array, the system SHALL automatically open and focus the first document in that array in the document editing area.

#### Scenario: Conversation with documentIds auto-opens first document
- **WHEN** the active conversation changes to one with `documentIds?.[0]` set
- **AND** that document exists and can be resolved to a path
- **THEN** the system MUST call `documentWorkspace.openNode(path)` with that document's path
- **AND** the document editing area MUST display and focus that document

#### Scenario: Conversation without documentIds does not change document area
- **WHEN** the active conversation changes to one with no `documentIds` (or empty array)
- **THEN** the system MUST NOT change the current document in the document editing area
- **AND** no error SHALL occur

#### Scenario: Conversation's associated document does not exist
- **WHEN** the active conversation changes and `documentIds[0]` does not resolve to an existing document
- **THEN** the system MUST silently skip the document open operation
- **AND** no error SHALL be surfaced to the user
- **AND** the document editing area MUST remain unchanged

#### Scenario: Expanding to full-screen auto-opens associated document
- **WHEN** the user clicks the expand button from the right panel
- **AND** the active conversation has `documentIds?.[0]` set
- **THEN** the system MUST auto-open that document in the document editing area

#### Scenario: Document already open matches associated document
- **WHEN** the active conversation changes and the document that would be auto-opened is already the active document
- **THEN** the system MUST NOT re-open or re-focus it unnecessarily
