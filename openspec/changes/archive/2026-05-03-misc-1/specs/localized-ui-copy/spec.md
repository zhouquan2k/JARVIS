## ADDED Requirements

### Requirement: Localized copy MUST cover miscellaneous workspace controls
Shared UI copy for Markdown search, conversation rename, dirty save state, and functional message details MUST be rendered through translation keys for every supported locale.

#### Scenario: Render Markdown search copy through translations
- **WHEN** the Markdown search control is visible
- **THEN** placeholder text, match count text, previous/next labels, and close labels MUST come from translation entries

#### Scenario: Render conversation rename and functional detail copy through translations
- **WHEN** the conversation rename controls or functional message detail controls are visible
- **THEN** their user-facing labels, tooltips, and empty/status text MUST come from translation entries

#### Scenario: Render dirty save copy through translations
- **WHEN** the save button communicates unsaved changes
- **THEN** the accessible label or tooltip MUST come from translation entries
