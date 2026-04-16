English | [Chinese](spec.zh-CN.md)

## ADDED Requirements

### Requirement: Provider remote config MUST expose a versioned Gemini history selector document
The system MUST provide a remote configuration document for Gemini history fetching and distribute it through a versioned JSON contract so the extension can update selector rules without republishing.

#### Scenario: Fetch latest Gemini history config
- **WHEN** the extension requests the Gemini history remote configuration
- **THEN** the server MUST return a JSON document containing `version`, `matchOrigins`, `selectors`, and `healthCheck`
- **AND** that document MUST be sufficient to drive Gemini history lists, details, and lazy-load detection

#### Scenario: Reject unknown provider config request
- **WHEN** the client requests a remote configuration for a provider that does not exist
- **THEN** the server MUST return a clear not-found response
- **AND** the system MUST NOT return a fabricated empty configuration

### Requirement: Provider remote config consumer MUST cache the last valid config and support fallback
The extension MUST cache the most recent Gemini remote configuration that passed health checks, and it MUST fall back to the cache or a built-in snapshot when the network fails.

#### Scenario: Use cached config when network is unavailable
- **WHEN** the extension encounters a network error while refreshing the Gemini remote configuration, but a recent valid cache exists locally
- **THEN** the system MUST continue using that cached configuration to complete the fetch
- **AND** the system MUST mark this run as coming from cache fallback rather than a fresh fetch

#### Scenario: Fail when no valid config exists
- **WHEN** the remote fetch fails and both the local cache and the built-in fallback snapshot are unavailable
- **THEN** the system MUST return `CONFIG_UNAVAILABLE`
- **AND** the system MUST stop Gemini DOM fetching from continuing
