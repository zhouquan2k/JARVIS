## ADDED Requirements

### Requirement: Core interfaces MUST define an optional provider capability for conversation title generation
The core model-provider contract MUST allow providers to expose an optional conversation-title generation capability that is separate from normal message sending. Providers that do not implement this capability MUST remain compatible with the base `IModelProvider` contract.

#### Scenario: Expose optional title generation without changing basic send semantics
- **WHEN** the core module exports model-provider interfaces
- **THEN** the system MUST allow `IModelProvider` to expose an optional `generateConversationTitle(...)` capability
- **AND** providers that do not implement that capability MUST continue to work through the existing message-sending contract

#### Scenario: Keep title generation independent from active reasoning settings
- **WHEN** a caller requests provider-side conversation title generation
- **THEN** the shared title-generation options MUST remain independent from normal `reasoningEffort` and model option settings
- **AND** the caller MUST NOT be required to pass active chat reasoning configuration into the title-generation path
