# group-summarizer Specification

## Purpose
TBD - created by archiving change group-conversation-enhance. Update Purpose after archive.
## Requirements
### Requirement: Summarizer MUST be configured at preset level
Each group preset SHALL be able to declare a summarizer model (`GroupSummarizerConfig`) consisting of a `providerId`, `modelId`, and optional `systemPrompt`. The summarizer is resolved by preset ID at runtime; if no summarizer is configured for a preset, no summarization occurs.

#### Scenario: Preset has summarizer configured
- **WHEN** a group preset ID maps to a `GroupSummarizerConfig` entry in `APP_CONFIG.groupSummarizers`
- **THEN** the system MUST use that provider and model to run summarization after member completion

#### Scenario: Preset has no summarizer configured
- **WHEN** no `GroupSummarizerConfig` entry exists for the current preset ID
- **THEN** the system MUST skip summarization silently
- **AND** no `Summary` tab SHALL be shown for that turn

### Requirement: Summarizer MUST be triggered automatically after all members complete
After all member providers finish responding (≥2 members), the group provider SHALL automatically invoke the configured summarizer with a prompt containing all members' answers. The result SHALL stream into `groupSummary`.

#### Scenario: Auto-trigger after all members complete
- **WHEN** all member providers have resolved (`status` is `'done'` or `'error'`)
- **AND** the number of participating members is ≥ 2
- **AND** a summarizer is configured for the current preset
- **THEN** the system MUST automatically invoke the summarizer provider

#### Scenario: Summarizer streams into groupSummary
- **WHEN** the summarizer provider begins responding
- **THEN** the system MUST set `groupSummary.phase` to `'streaming'`
- **AND** each chunk MUST update `groupSummary.content` incrementally
- **THEN** upon completion the system MUST set `groupSummary.phase` to `'done'`

### Requirement: Summarizer MUST NOT trigger for single-member turns
When only one member participates in a group turn, the summarizer SHALL NOT be invoked and `groupSummary` SHALL remain absent from the message.

#### Scenario: Single member skips summarization
- **WHEN** the group turn has exactly 1 participating member
- **THEN** the system MUST NOT invoke the summarizer
- **AND** the resulting `ConversationMessage` MUST NOT contain a `groupSummary` field

### Requirement: Summarizer MUST include member attribution instruction in its prompt
The prompt sent to the summarizer SHALL instruct it to produce three sections (consensus, complementary insights, conflicts) and to attribute viewpoints using `@MemberName` notation.

#### Scenario: Prompt contains attribution instruction
- **WHEN** the system constructs the summarizer prompt
- **THEN** the prompt MUST include the names of all participating members
- **AND** the prompt MUST instruct the model to use `@MemberName` to attribute statements to specific members
- **AND** the prompt MUST request output organized in consensus / complementary / conflicts sections

### Requirement: Summarizer failure MUST be handled gracefully
If the summarizer provider returns an error, the system SHALL record the error in `groupSummary` without blocking the turn result. Members' content SHALL remain accessible via their individual tabs.

#### Scenario: Summarizer errors are recorded in groupSummary
- **WHEN** the summarizer provider throws or rejects
- **THEN** the system MUST set `groupSummary.phase` to `'error'`
- **AND** `groupSummary.error` MUST contain the error message
- **AND** individual member tabs MUST remain accessible and unaffected

### Requirement: Summarizer MUST be included in abort propagation
When the group provider's `abort()` is called, the abort MUST be forwarded to the summarizer provider if it is currently running.

#### Scenario: Abort cancels summarizer
- **WHEN** the user aborts the group turn while the summarizer is generating
- **THEN** the system MUST call `abort()` on the summarizer provider
- **AND** `groupSummary.phase` MUST be set to `'error'` with an abort message

### Requirement: Summarizer MUST use API-backed providers only
The summarizer SHALL be resolved to API-backed providers only (not DOM automation providers) to avoid timing and lifecycle issues with external site automation.

#### Scenario: DOM provider is excluded from summarizer
- **WHEN** `GroupSummarizerConfig.providerId` resolves to a DOM automation provider
- **THEN** the system MUST log a warning and skip summarization
- **AND** no error SHALL be surfaced to the user

