## ADDED Requirements

### Requirement: ChatGPT Web provider MUST support low-cost conversation title generation
The ChatGPT Web provider MUST be able to generate a concise conversation title from a user question through the shared provider title-generation capability. This title-generation path MUST use a provider-selected low-cost, non-thinking model rather than inheriting the active chat model, model options, or reasoning effort.

#### Scenario: Generate a title with a dedicated low-cost provider path
- **WHEN** the caller requests conversation title generation from `ChatGPTWebProvider`
- **THEN** the provider MUST issue a dedicated title-generation request
- **AND** that request MUST use a provider-selected low-cost non-thinking model instead of the current conversation model

#### Scenario: Return normalized title text only
- **WHEN** the provider receives a raw title-generation result from ChatGPT Web
- **THEN** the provider MUST normalize the result into concise title text
- **AND** the provider MUST NOT return explanatory prose, quoted wrappers, or multi-line output as the conversation title
