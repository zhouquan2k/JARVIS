## ADDED Requirements

### Requirement: Conversation workspace MUST automatically title newly created local conversations from the first question
The conversation workspace MUST replace the `New Chat` placeholder on a newly created local conversation with a concise title derived from the first successfully sent user question. This behavior MUST apply to local conversations created in normal conversation mode and MUST persist through the configured conversation persistence provider.

#### Scenario: Replace the placeholder title after the first successful send
- **WHEN** a newly created local conversation still has the title `New Chat`
- **AND** the user successfully sends the first question in normal conversation mode
- **THEN** the system MUST generate a concise conversation title from that first question
- **AND** the system MUST persist the generated title on the conversation

#### Scenario: Do not block the main send flow when title generation fails
- **WHEN** the first question send succeeds but automatic title generation fails
- **THEN** the system MUST keep the assistant response successful
- **AND** the system MUST persist a deterministic local fallback title instead of leaving the conversation unnamed

### Requirement: Conversation workspace MUST regenerate title only when the first visible question is resent
The conversation workspace MUST allow the title of a local conversation to be regenerated when the user edits and resends the first visible question. Ordinary follow-up sends MUST NOT overwrite an existing non-placeholder title, including a manual rename.

#### Scenario: Regenerate title after editing and resending the first visible question
- **WHEN** the user edits and resends the first visible user question of a local conversation
- **THEN** the system MUST regenerate the conversation title from the revised first question
- **AND** the regenerated title MUST be persisted on the same conversation

#### Scenario: Preserve the current title during ordinary follow-up turns
- **WHEN** a local conversation already has a non-placeholder title
- **AND** the user sends a later follow-up question without editing the first visible question
- **THEN** the system MUST keep the existing conversation title unchanged
- **AND** the system MUST NOT overwrite a manual rename during that send
