## ADDED Requirements

### Requirement: Local provider server MUST expose Codex auth state and login initiation
The local provider server MUST expose server-backed auth APIs for `chatgpt-codex` so all supported hosts can discover whether Codex is ready and can initiate a login recovery flow through one shared contract.

#### Scenario: Return current Codex auth status
- **WHEN** a host calls the local provider server's Codex auth status endpoint
- **THEN** the server MUST report whether the installed Codex backend is currently authenticated
- **AND** the response MUST be normalized so the caller does not need to parse raw CLI output

#### Scenario: Start a Codex login recovery flow
- **WHEN** a host requests a Codex login recovery flow from the local provider server
- **THEN** the server MUST initiate a supported Codex login path
- **AND** the server MUST return normalized login instructions or device-auth metadata that the host can present to the user

### Requirement: Local provider server MUST expose Codex model catalog lookup
The local provider server MUST provide one model catalog endpoint for `chatgpt-codex` so all supported hosts resolve the same Codex model list and default model behavior.

#### Scenario: Resolve Codex model catalog through the server
- **WHEN** a host or provider requests the `chatgpt-codex` model catalog
- **THEN** the local provider server MUST obtain the available Codex models from the backend execution layer
- **AND** the server MUST return a normalized `ProviderModelCatalog`

### Requirement: Local provider server MUST proxy normal Codex chat execution
The local provider server MUST expose a chat execution endpoint for `chatgpt-codex` and MUST stream normalized response events back to the caller.

#### Scenario: Stream a Codex chat response through the server
- **WHEN** a caller submits a normal Codex chat request to the local provider server
- **THEN** the server MUST execute the request through the Codex backend
- **AND** the server MUST stream normalized response events back to the caller until completion

### Requirement: Local provider server MUST proxy Codex agent execution
The local provider server MUST expose an agent execution endpoint for `chatgpt-codex` so ChatPrism Agent mode can reuse the same backend login and execution path.

#### Scenario: Execute an agent request through the server
- **WHEN** a caller submits an agent execution request for `chatgpt-codex`
- **THEN** the local provider server MUST execute that request through the Codex backend
- **AND** the server MUST return normalized streaming and final-result payloads compatible with the provider contract

### Requirement: Local provider server MUST isolate hosts from direct Codex CLI details
The local provider server MUST hide raw CLI invocation details from web, extension, and desktop hosts so host code depends only on normalized HTTP contracts.

#### Scenario: Hosts avoid parsing raw CLI output
- **WHEN** any supported host uses `chatgpt-codex`
- **THEN** the host MUST interact only with normalized server endpoints
- **AND** CLI command construction, output parsing, and error normalization MUST remain on the server side
