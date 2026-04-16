# user-facing-error-english Specification

## Purpose
TBD - created by archiving change i18n-3. Update Purpose after archive.
## Requirements
### Requirement: User-facing errors SHALL use English default messages
Error messages that are shown directly to users or surfaced through API responses SHALL use English default copy, and they MUST NOT require locale-based language switching.

#### Scenario: UI-visible error is emitted
- **WHEN** the application produces an error message that will be shown in the UI
- **THEN** that error message MUST use English default copy
- **AND** the system MUST NOT rely on the UI locale to select a Chinese message for the error

#### Scenario: API-visible validation error is emitted
- **WHEN** a server route or sync validation returns an error that the client will display
- **THEN** the returned error message MUST use English default copy

### Requirement: Existing error codes SHALL be reused without exception i18n dictionaries
The existing error-code flow SHALL continue to be reused for stable error-type discrimination; the implementation MUST NOT add `en` / `zh-CN` translation entries or a multilingual runtime for error messages.

#### Scenario: External history error is mapped by code
- **WHEN** the external-history flow returns `AUTH_REQUIRED`, `DETAIL_NOT_FOUND`, or `SELECTOR_MISMATCH`
- **THEN** the UI or store MUST use that error code to select the English default message
- **AND** the system MUST NOT query an additional error translation dictionary for that error

### Requirement: Internal-only logs MAY remain unchanged unless they leak to users
Logs used only for internal debugging MAY remain unchanged; if a message is shown in the UI, returned by an API, or used by a recovery entry, it MUST be covered by the English default message policy.

#### Scenario: Debug-only text is not displayed
- **WHEN** a log line is only written to the console and will not be consumed by the user interface or an API response
- **THEN** Phase 3 MAY leave that log text unchanged

#### Scenario: Message crosses user boundary
- **WHEN** a message will be written to `currentError`, `analysisError`, an HTTP JSON error, or a host recovery prompt
- **THEN** that message MUST use English default copy

### Requirement: External site matching text SHALL not be translated as user copy
Chinese selector or regex text used to match external-site DOM nodes, aria-labels, placeholders, URLs, or page text SHALL NOT be treated as user-visible copy; the implementation MUST preserve such matching text unless it can be proven unnecessary.

#### Scenario: Gemini DOM selector contains Chinese matching text
- **WHEN** the Gemini DOM scraping configuration includes Chinese `aria-label` or placeholder matching fragments
- **THEN** Phase 3 MUST NOT remove those fragments as part of English copy governance
