## MODIFIED Requirements

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
