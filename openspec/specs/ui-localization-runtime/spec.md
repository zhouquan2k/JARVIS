# ui-localization-runtime Specification

## Purpose
TBD - created by archiving change i18n-2. Update Purpose after archive.
## Requirements
### Requirement: Shared UI localization runtime MUST support English and Simplified Chinese
The shared UI localization runtime MUST support `en` and `zh-CN` locales and provide unified message lookup, language switching, and current-locale access for the Web, Extension, and Desktop hosts.

#### Scenario: Host reads localized copy through shared runtime
- **WHEN** any host renders a shared UI component or view
- **THEN** the system MUST resolve the current locale through the shared UI localization runtime
- **AND** the component MUST be able to read the corresponding message resources based on that locale

#### Scenario: Supported locale is constrained to Phase 2 scope
- **WHEN** the host initializes the shared UI localization runtime
- **THEN** the system MUST support at least `en` and `zh-CN`
- **AND** the system MUST NOT require other languages in Phase 2

### Requirement: Locale initialization MUST prefer persisted user choice
The shared UI localization runtime MUST resolve the initial locale in the order "persisted user choice > host language > default English" so that an explicitly chosen language remains effective after refresh or restart.

#### Scenario: Persisted locale overrides host language
- **WHEN** a user-selected locale already exists in local storage
- **THEN** the host MUST restore that locale first at startup
- **AND** the system MUST NOT override that choice because the host language differs

#### Scenario: Host language is used when persisted locale is absent
- **WHEN** no saved locale exists in local storage
- **THEN** the system MUST resolve `en` or `zh-CN` based on the browser or host language
- **AND** it MUST fall back to `en` if the language cannot be recognized

### Requirement: All three hosts MUST install the shared localization runtime before mount
The Web, Extension, and Desktop hosts MUST install the shared UI localization runtime before application mount so the initial render uses the correct locale, rather than fixing copy asynchronously after mount.

#### Scenario: Web host installs localization runtime before mount
- **WHEN** the Web host starts the application
- **THEN** the host MUST install the shared UI localization runtime before `app.mount()`

#### Scenario: Extension and Desktop hosts install the same runtime contract
- **WHEN** the Extension or Desktop host starts the application
- **THEN** the host MUST install the same shared UI localization runtime before `app.mount()`
- **AND** the runtime contract MUST remain consistent with the Web host

### Requirement: Locale switching MUST persist and update the current UI session
When the user switches languages in the UI, the system MUST immediately refresh the static copy in the current session and persist the selected locale for later refresh and restart recovery.

#### Scenario: Switching locale updates visible UI copy
- **WHEN** the user switches the locale from `zh-CN` to `en` through the language switch entry
- **THEN** the static visible copy in the current interface MUST switch to English

#### Scenario: Switched locale survives refresh
- **WHEN** the user refreshes the page or restarts the host after switching locale
- **THEN** the system MUST restore the last saved locale
