## ADDED Requirements

### Requirement: ChatGPT Web provider MUST normalize functional metadata into functional message parts
The ChatGPT Web provider MUST normalize confidently structured search, tool, or function metadata from ChatGPT responses into shared functional message parts. It MUST keep response text and annotations compatible with the existing rendering path.

#### Scenario: Normalize search metadata into functional parts
- **WHEN** a ChatGPT Web response contains structured search metadata separate from assistant answer text
- **THEN** the provider MUST convert that metadata into `functionalParts` with a search or trace kind
- **AND** the provider MUST continue returning the assistant answer text through the normal `text` field

#### Scenario: Avoid guessing from unstructured history text
- **WHEN** a ChatGPT history detail only contains unstructured rendered text
- **THEN** the provider MUST NOT invent functional parts by parsing ambiguous prose
- **AND** the conversation MUST continue to preserve the original message text
