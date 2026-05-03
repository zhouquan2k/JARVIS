## ADDED Requirements

### Requirement: Core conversation model MUST preserve structured functional message parts
The core conversation model MUST allow assistant messages to carry optional structured functional parts for tool calls, function calls, search traces, and related operational details. Conversations without these parts MUST remain valid.

#### Scenario: Store functional parts on a conversation message
- **WHEN** a provider or runtime returns structured functional details for an assistant message
- **THEN** the system MUST allow the message to persist those details as `functionalParts`
- **AND** the message MUST continue to preserve its normal text content and annotations

#### Scenario: Load conversations without functional parts
- **WHEN** the system normalizes an older conversation message that has no `functionalParts`
- **THEN** the system MUST treat the field as absent
- **AND** the conversation MUST remain readable and renderable

### Requirement: Provider result contracts MUST carry optional functional message parts
The provider stream and final result contracts MUST support optional functional message parts so normal providers, Agent-capable providers, and proxy providers can share one output shape.

#### Scenario: Stream functional parts during generation
- **WHEN** a provider has structured functional details during a streaming response
- **THEN** the provider stream update MAY include `functionalParts`
- **AND** consumers MUST be able to associate those parts with the active assistant message

#### Scenario: Return functional parts in final result
- **WHEN** a provider completes a response with structured functional details
- **THEN** the final provider result MUST be able to include `functionalParts`
- **AND** the field MUST be optional for providers that do not expose such details
