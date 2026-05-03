## ADDED Requirements

### Requirement: Gemini provider MUST normalize function and tool metadata into functional message parts
The Gemini provider MUST convert structured function-call or tool-call metadata from normal and native Agent Gemini responses into shared functional message parts when such metadata is available.

#### Scenario: Normalize Gemini function call metadata
- **WHEN** a Gemini response includes structured function-call metadata
- **THEN** the provider MUST expose that metadata as `functionalParts`
- **AND** the normal assistant text stream MUST remain available through the shared `text` update

#### Scenario: Preserve normal responses without functional metadata
- **WHEN** a Gemini response contains only assistant answer text
- **THEN** the provider MUST return no functional parts
- **AND** the response MUST render as a normal assistant message
