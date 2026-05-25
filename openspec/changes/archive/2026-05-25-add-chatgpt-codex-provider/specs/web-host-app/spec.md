## ADDED Requirements

### Requirement: Web host MUST expose auth recovery for the server-backed ChatGPT Codex provider
The web host MUST provide a visible auth recovery entry when the current provider is `chatgpt-codex` and the local provider server reports that Codex is not authenticated.

#### Scenario: Show a Codex login entry in the web host
- **WHEN** the current provider is `chatgpt-codex` and `checkAuth()` returns `false`
- **THEN** the web host MUST show a visible Codex sign-in or recovery action
- **AND** the host MUST present user-facing copy that explains the Codex provider is currently unavailable until login completes

#### Scenario: Refresh auth after login recovery begins
- **WHEN** the user triggers the web host's Codex login recovery action
- **THEN** the host MUST start the local server-backed login flow
- **AND** the host MUST retry Codex auth status until the provider becomes available or the flow fails
