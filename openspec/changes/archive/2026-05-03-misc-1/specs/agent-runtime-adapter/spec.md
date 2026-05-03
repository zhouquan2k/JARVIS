## ADDED Requirements

### Requirement: Agent runtime adapter MUST emit structured functional parts for tool-loop details
The Agent runtime adapter MUST expose application-managed tool-loop calls and results as structured functional message parts in addition to any compatible text output. These parts MUST use the shared provider result contract so the UI can render them through the same collapsed functional details component used by normal chat.

#### Scenario: Emit tool call functional parts after a tool loop round
- **WHEN** the native Agent path receives tool calls and executes them through the shared tool executor
- **THEN** the Agent runtime MUST create functional parts describing the tool calls and tool results
- **AND** those parts MUST be included in the stream update or final provider result for the assistant message

#### Scenario: Preserve shared stream contract
- **WHEN** the Agent runtime streams text and functional details
- **THEN** it MUST continue using `ProviderStreamUpdate`
- **AND** it MUST NOT introduce an Agent-only UI event protocol for functional details
