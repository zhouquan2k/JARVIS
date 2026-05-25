English | [Chinese](spec.zh-CN.md)

## Purpose
Define how model runtime providers are filtered and instantiated across supported host runtime modes.

## Requirements

### Requirement: Filter providers by runtime mode
The system MUST filter providers by runtime mode (`runtimeMode`) and expose only the providers that can run in the current mode. The `web`, `extension`, and `desktop` runtime modes MUST all be subject to this filtering. The runtime contract carrying this behavior MUST be consolidated under the name `ModelProviderRuntime`.

#### Scenario: Runtime mode filtering remains stable after runtime rename
- **WHEN** the host initializes the model runtime assembly layer with any `runtimeMode`
- **THEN** `ModelProviderRuntime.getAvailableProviders()` MUST return only the providers supported by the current mode
- **AND** providers that do not satisfy the current runtime conditions MUST NOT appear in the selector

### Requirement: Runtime returns provider instances by `providerId`
The system MUST return `IModelProvider` instances by `providerId` through a unified model runtime assembly interface. In extension and desktop compare modes, the runtime MUST support the instance isolation required for concurrent requests, such as fresh instances or separate channels. This behavior MUST remain unchanged after the type and factory names are consolidated under `ModelProviderRuntime`.

#### Scenario: Compare workflow still obtains isolated provider instances
- **WHEN** the compare workflow requests multiple provider instances at the same time through `ModelProviderRuntime.getProvider(providerId, { fresh: true })`
- **THEN** the runtime MUST return instances that can run concurrently without interfering with each other
- **AND** updates and abort behavior for each request chain MUST be independently controllable

### Requirement: Host injects credentials and execution dependencies through runtime initialization
The host MUST inject credentials or execution dependency resolution strategies during model runtime initialization, and the runtime MUST pass through the required dependencies when creating concrete provider instances. For extension and desktop hosts, providers that require host-only secrets or controlled pages MUST continue to use proxy-backed execution paths; providers whose sensitive execution path has already been consolidated behind the local provider server MAY be constructed directly in `web`, `extension`, and `desktop` without an extra host proxy layer.

#### Scenario: Proxy hosts keep runtime injection semantics after rename
- **WHEN** the web, extension, or desktop host initializes `ModelProviderRuntime`
- **THEN** the host frontend MUST continue to obtain provider instances through runtime factory or option injection
- **AND** providers that still depend on host-only cookies, controlled pages, or background bridges MUST keep those dependencies off the renderer side

#### Scenario: Server-backed providers can be created directly in every supported host
- **WHEN** a provider's sensitive auth and execution path has been consolidated behind the local provider server
- **THEN** `ModelProviderRuntime` MAY create that provider directly in `web`, `extension`, and `desktop`
- **AND** the runtime MUST still preserve per-provider fresh-instance behavior for concurrent requests
