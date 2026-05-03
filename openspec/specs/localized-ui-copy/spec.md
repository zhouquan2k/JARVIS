# localized-ui-copy Specification

## Purpose
Define localization requirements for shared UI copy, including static labels, navigation text, provider/model display copy, and newly added workspace controls.
## Requirements
### Requirement: Shared static UI copy MUST be localized through translation keys
Static copy in the shared UI that is shown directly to users MUST be rendered through translation keys rather than continuing to rely on inline hard-coded strings as the sole copy source. This requirement SHALL cover buttons, labels, empty states, placeholders, menus, panel titles, and static prompts.

#### Scenario: Static labels in shared views are localized
- **WHEN** the user switches the locale of the shared chat or compare view
- **THEN** the static labels, buttons, and placeholders in the view MUST switch to the corresponding language

#### Scenario: Static labels in shared components are localized
- **WHEN** the user views empty states, menus, and panel titles in shared components
- **THEN** those static strings MUST be rendered through translation keys

### Requirement: Route labels and workspace navigation copy MUST be localized
Shared workspace route labels and navigation copy MUST support locale switching so that the top bar and workspace switch entry render consistent localized results across all three hosts.

#### Scenario: Route labels switch with locale
- **WHEN** the user switches locale
- **THEN** the workspace labels provided by `packages/ui/src/routes.ts` MUST switch to the corresponding language

### Requirement: Provider, model and option display copy MUST support localization keys
User-facing provider, model, and option text in `packages/core/config.ts` MUST support translation keys; when rendering UI, the system MUST prefer the copy associated with the translation key and fall back to the English default when it is missing.

#### Scenario: Provider selector renders localized provider labels
- **WHEN** the user views the provider selector under different locales
- **THEN** the provider names MUST use the copy for the corresponding locale

#### Scenario: Model option descriptions render localized copy with fallback
- **WHEN** a model option has a translation key configured
- **THEN** the UI MUST prefer the localized copy for that key
- **AND** when the key is missing, the UI MUST fall back to the English original in the config

### Requirement: Phase 2 localization MUST exclude runtime error messages
Phase 2 UI localization MUST exclude `currentError`, `analysisError`, `throw new Error(...)`, and other runtime exception messages; these texts MAY continue to be displayed from their original fields and SHALL be governed separately in Phase 3.

#### Scenario: Error strings remain outside translation resources in Phase 2
- **WHEN** the system migrates shared UI copy in Phase 2
- **THEN** runtime exception messages MUST NOT be required to enter translation entries

### Requirement: Localized copy MUST follow the repository glossary
New `en` and `zh-CN` translation entries added in Phase 2 MUST follow the repository glossary established in Phase 1 to avoid terminology drift on core concepts such as Workspace, Agent, Provider, and Context.

#### Scenario: Core UI terms stay consistent across locales
- **WHEN** the user views copy involving Workspace, Agent, Provider, or Context under different locales
- **THEN** the translation results MUST remain consistent with the glossary's canonical Chinese-English definitions

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
