## ADDED Requirements

### Requirement: Gemini provider MUST support low-cost conversation title generation
The Gemini provider MUST be able to generate a concise conversation title from a user question through the shared provider title-generation capability. This path MUST use a provider-selected low-cost, non-thinking Gemini model rather than inheriting the active conversation model, model options, or reasoning effort.

#### Scenario: Generate a title with a dedicated low-cost Gemini path
- **WHEN** the caller requests conversation title generation from the Gemini provider
- **THEN** the provider MUST issue a dedicated title-generation request through its provider-side title path
- **AND** that request MUST use a provider-selected low-cost non-thinking Gemini model instead of the current conversation model

#### Scenario: Return normalized standalone title text
- **WHEN** the Gemini provider receives a raw title-generation result
- **THEN** the provider MUST normalize the result into a concise standalone title
- **AND** the provider MUST NOT return explanatory prose or multi-line answer text as the title
