## ADDED Requirements

### Requirement: Local history sidebar MUST support local conversation renaming
The conversation workspace MUST allow users to rename local conversation history entries from the shared sidebar. The rename operation MUST persist through the configured conversation persistence provider and MUST NOT be available for external history preview rows.

#### Scenario: Rename a local conversation from the sidebar
- **WHEN** the user edits a local conversation title and submits the rename
- **THEN** the system MUST persist the trimmed title on that local conversation
- **AND** the local history list MUST show the updated title

#### Scenario: Rename the active local conversation
- **WHEN** the user renames the currently active local conversation
- **THEN** the system MUST update both the persisted conversation and the active conversation state
- **AND** the active chat header or toolbar title MUST use the updated title after refresh

#### Scenario: Do not rename external history rows
- **WHEN** the sidebar is showing external history results
- **THEN** the system MUST NOT expose the local conversation rename action for those rows

### Requirement: Normal chat view MUST render shared collapsible functional message parts
The conversation workspace MUST render structured functional message parts in the shared normal chat surface. Functional parts MUST be collapsed by default and MUST be available anywhere `NormalChatView` renders assistant messages, including normal chat, Agent pane chat, and previewed or imported conversations.

#### Scenario: Render functional parts collapsed by default
- **WHEN** an assistant message contains one or more `functionalParts`
- **THEN** `NormalChatView` MUST render a functional details section for that message
- **AND** each functional part MUST be collapsed by default

#### Scenario: Expand functional message detail
- **WHEN** the user activates a functional part header
- **THEN** the system MUST expand that part and show its detailed content without changing the assistant answer text

#### Scenario: Keep messages without functional parts unchanged
- **WHEN** an assistant message has no `functionalParts`
- **THEN** the system MUST render the message without an empty functional details section

### Requirement: Conversation workspace MUST support explicit `@filename` file context references
The conversation workspace MUST allow users to reference workspace files in chat input with `@filename` and include those files as additional request context at send time. This capability MUST NOT rewrite the `@filename` text inside the user's question; referenced file contents MUST be injected as standalone prompt sections labeled by filename. File resolution MUST use the effective Agent context for the conversation rather than the entire workspace tree.

#### Scenario: Preserve the existing first-turn current-document behavior
- **WHEN** the user sends the first message of a conversation
- **THEN** the system MUST preserve the existing auto-include behavior for the current selected document
- **AND** the new `@filename` behavior MUST act as an additional context mechanism rather than replacing that first-turn flow

#### Scenario: Inject standalone context sections for `@filename` on any turn
- **WHEN** the user sends a message containing one or more `@filename` references
- **THEN** the system MUST append a standalone context section for each successfully resolved file
- **AND** each section MUST explicitly label the corresponding filename
- **AND** the original `@filename` text MUST remain in the user's question

#### Scenario: Unbound conversations resolve references from the default Agent context
- **WHEN** the conversation is not explicitly bound to an Agent
- **THEN** `@filename` resolution MUST use the current default active Agent scope
- **AND** files outside that Agent scope MUST NOT participate in basename ambiguity checks

#### Scenario: Only inject a repeated file once
- **WHEN** the user references the same resolved file path multiple times in one message
- **THEN** the system MUST inject that file content only once

#### Scenario: Block send on missing or ambiguous references
- **WHEN** an `@filename` does not resolve to a unique file inside the current Agent context
- **THEN** the system MUST block the send
- **AND** the system MUST show a clear missing-file or ambiguous-match error instead of guessing
