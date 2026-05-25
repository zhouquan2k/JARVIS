## ADDED Requirements

### Requirement: Desktop host MUST expose auth recovery for the server-backed ChatGPT Codex provider
The desktop host MUST provide a visible auth recovery entry when the current provider is `chatgpt-codex` and the local provider server reports that Codex is not authenticated.

#### Scenario: Show a Codex login entry in the desktop host
- **WHEN** the current provider is `chatgpt-codex` and `checkAuth()` returns `false`
- **THEN** the desktop host MUST show a visible Codex sign-in or recovery action
- **AND** the host MUST present user-facing copy that explains the Codex provider is currently unavailable until login completes

#### Scenario: Use the server-backed provider directly in the desktop host
- **WHEN** the desktop host initializes `chatgpt-codex`
- **THEN** the host MUST construct the provider through the local provider server path rather than the desktop ChatGPT Web session path
- **AND** the shared workspace MUST continue to access the provider through normal runtime injection
