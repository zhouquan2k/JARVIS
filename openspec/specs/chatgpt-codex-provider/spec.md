English | [Chinese](spec.zh-CN.md)

## Purpose
Define the shared server-backed ChatGPT Codex provider contract used by supported hosts.

## Requirements
### Requirement: ChatGPT Codex provider MUST expose one unified provider across web, extension, and desktop
The system MUST provide a first-class `chatgpt-codex` model provider that is available through `ModelProviderRuntime` in `web`, `extension`, and `desktop` runtime modes. This provider MUST use one server-backed execution path rather than host-specific ChatGPT Web session implementations.

#### Scenario: Resolve Codex provider in any supported runtime
- **WHEN** a host initializes `ModelProviderRuntime` with `runtimeMode = 'web'`, `runtimeMode = 'extension'`, or `runtimeMode = 'desktop'`
- **THEN** `ModelProviderRuntime.getAvailableProviders()` MUST include `chatgpt-codex`
- **AND** `ModelProviderRuntime.getProvider('chatgpt-codex')` MUST return a provider instance backed by the same server-facing contract

#### Scenario: Exclude Codex from unsupported runtime modes only
- **WHEN** a runtime mode does not satisfy the configured support matrix for `chatgpt-codex`
- **THEN** the provider MUST NOT appear in that runtime's provider catalog
- **AND** the absence MUST be determined by runtime filtering rather than host-specific UI branching

### Requirement: ChatGPT Codex provider MUST resolve auth and model catalog through the local provider server
The `chatgpt-codex` provider MUST determine auth state and model availability through the local provider server rather than direct browser cookies or direct calls to private ChatGPT Web endpoints.

#### Scenario: Check auth through the local server
- **WHEN** the UI calls `checkAuth()` for `chatgpt-codex`
- **THEN** the provider MUST query the local provider server for Codex auth status
- **AND** the provider MUST return a normalized boolean result suitable for host recovery flows

#### Scenario: Resolve model catalog through the local server
- **WHEN** the runtime requests `getAvailableModels()` for `chatgpt-codex`
- **THEN** the provider MUST query the local provider server for the Codex model catalog
- **AND** the provider MUST return a normalized `ProviderModelCatalog`

### Requirement: ChatGPT Codex provider MUST support normal chat execution through streamed provider updates
The `chatgpt-codex` provider MUST support normal `sendMessage(...)` execution through the local provider server and MUST continue to emit `ProviderStreamUpdate` / `ProviderSendResult` compatible with existing chat rendering flows.

#### Scenario: Stream a normal Codex response
- **WHEN** the caller invokes `sendMessage(prompt, options, onUpdate)` on `chatgpt-codex`
- **THEN** the provider MUST forward the request to the local provider server
- **AND** the provider MUST emit normalized streaming text updates through `onUpdate`
- **AND** the final result MUST include normalized `text`, `conversationId`, and `messageId`

#### Scenario: Keep Codex out of external history responsibilities
- **WHEN** the system resolves `chatgpt-codex`
- **THEN** the provider MUST continue to behave as a model provider only
- **AND** the provider MUST NOT be required to implement external history import capabilities

### Requirement: ChatGPT Codex provider MUST implement IAgentCapableProvider
The `chatgpt-codex` provider MUST implement `IAgentCapableProvider` so ChatPrism Agent mode can select it as a native-agent backend.

#### Scenario: Expose native agent capability
- **WHEN** the agent runtime resolves `chatgpt-codex`
- **THEN** the provider MUST expose `getAgentCapabilities()`
- **AND** the returned capability declaration MUST mark the provider as native-agent capable

#### Scenario: Run an agent request through the Codex backend
- **WHEN** the agent runtime invokes `runAgent(request, onUpdate)` on `chatgpt-codex`
- **THEN** the provider MUST forward the request to the local provider server's Codex agent execution path
- **AND** the provider MUST return a normalized `ProviderSendResult` that remains compatible with the existing agent runtime contract

### Requirement: ChatGPT Codex provider MUST normalize server-backed auth failures for recovery
The `chatgpt-codex` provider MUST surface unauthenticated and unavailable-backend states in a way that allows hosts to show a login or recovery entry.

#### Scenario: Surface unauthenticated state without crashing the workspace
- **WHEN** the local provider server reports that Codex is not authenticated
- **THEN** `checkAuth()` MUST resolve to `false`
- **AND** the host MUST be able to retry auth without reconstructing the provider contract

#### Scenario: Surface execution failure with actionable provider error
- **WHEN** the local provider server cannot execute a Codex chat or agent request
- **THEN** the provider MUST return a normalized error to the caller
- **AND** the error MUST remain attributable to the current provider rather than being misclassified as an external history failure
