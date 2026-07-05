# group-message-tabs Specification

## Purpose
TBD - created by archiving change group-conversation-enhance. Update Purpose after archive.
## Requirements
### Requirement: Group turns MUST render as a tabbed message card
When a group conversation turn has more than one participating member, the assistant message SHALL be rendered as a tabbed card with a `Summary` tab followed by one tab per member. When exactly one member participates, the system SHALL render a plain bubble using that member's content.

#### Scenario: Multi-member group turn renders tabs
- **WHEN** an assistant message has `groupMembers` with 2 or more entries
- **THEN** the system MUST render a tabbed card with tabs: `[Summary] [MemberA] [MemberB] …`
- **AND** tab labels MUST include the member name and a status indicator dot

#### Scenario: Single-member group turn degrades to plain bubble
- **WHEN** an assistant message has `groupMembers` with exactly 1 entry
- **THEN** the system MUST render a plain Markdown bubble using that member's content
- **AND** no `Summary` tab SHALL be shown

#### Scenario: Legacy message without groupMembers renders as before
- **WHEN** an assistant message has no `groupMembers` field
- **THEN** the system MUST render it using the existing `MarkdownContent` path
- **AND** no errors SHALL occur

### Requirement: Tab status indicators MUST reflect member streaming state
Each member tab label SHALL display a visual status indicator that reflects the current state of that member's reply.

#### Scenario: Member is still generating
- **WHEN** a member's `status` is `'streaming'` or `'pending'`
- **THEN** that tab's indicator MUST show an in-progress state (spinner or animated dot)

#### Scenario: Member has completed
- **WHEN** a member's `status` is `'done'`
- **THEN** that tab's indicator MUST show a completed state (solid dot)

#### Scenario: Member has failed
- **WHEN** a member's `status` is `'error'`
- **THEN** that tab's indicator MUST show an error state (red dot)
- **AND** the tab content area MUST display the error message

### Requirement: Default tab selection MUST follow a defined lifecycle
The active tab SHALL follow a defined lifecycle: first member during streaming, then auto-switch to Summary after summarization completes (unless the user has manually switched).

#### Scenario: Default tab during streaming
- **WHEN** a group turn begins streaming
- **THEN** the system MUST default to the first member's tab

#### Scenario: Auto-switch to Summary on completion
- **WHEN** `groupSummary.phase` transitions to `'done'`
- **AND** the user has NOT manually switched tabs during this turn
- **THEN** the system MUST automatically set the active tab to `Summary`

#### Scenario: Respect manual tab selection
- **WHEN** the user has manually clicked any tab during the current turn
- **THEN** the system MUST NOT auto-switch the active tab when summarization completes
- **AND** the active tab MUST remain on the user's last selection

#### Scenario: Completed historical turns default to Summary
- **WHEN** a historical group turn message is displayed (already fully complete)
- **THEN** the system MUST default to the `Summary` tab

### Requirement: Summary Tab MUST display structured synthesis with member attribution
The `Summary` tab SHALL display the synthesized content with three sections (consensus, complementary insights, conflicts). `@MemberName` tokens in the content SHALL be rendered as clickable chips that navigate to that member's tab.

#### Scenario: Summary renders three sections
- **WHEN** `groupSummary.phase` is `'done'`
- **THEN** the system MUST render the summary content in the `Summary` tab

#### Scenario: @Member chip navigates to member tab
- **WHEN** the summary content contains an `@MemberName` token matching a member tab
- **THEN** the system MUST render that token as a clickable chip
- **AND** clicking the chip MUST switch the active tab to that member's tab

#### Scenario: Summary without @tokens renders as plain Markdown
- **WHEN** the summary content contains no `@MemberName` tokens
- **THEN** the system MUST render the content as plain Markdown without errors

### Requirement: Summary Tab MUST show progress state while generating
While the summarizer is running, the `Summary` tab SHALL show a progress view listing each member's completion status.

#### Scenario: Summary tab shows member progress during streaming
- **WHEN** `groupSummary.phase` is `'waiting'` or `'streaming'`
- **THEN** the `Summary` tab MUST display each member's name and completion status (done ✓ / in progress…)
- **AND** partial summary content SHALL be displayed as it streams in

