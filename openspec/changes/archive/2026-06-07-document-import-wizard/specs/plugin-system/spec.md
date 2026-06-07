## MODIFIED Requirements

### Requirement: Core contracts MUST define the initial plugin contribution model
The shared core contracts MUST define a minimal plugin contract surface that is frontend-runtime agnostic and supports the concrete contribution types currently required in this phase: global views, right-panel tabs, workspace-selection views, insert-link types, document imports, language-model contributions, and node presentations.

#### Scenario: Export plugin contracts from core without runtime host coupling
- **WHEN** shared packages or hosts import plugin contracts
- **THEN** the system MUST provide `PluginManifest`, `PluginEnablementConfig`, `PluginSetupApi`, and `ContributionQuery` from `packages/core`
- **AND** those contracts MUST NOT require importing the plugin-system runtime implementation

#### Scenario: Register only the concrete contribution types defined for this phase
- **WHEN** a plugin receives the setup API in this phase
- **THEN** the setup API MUST expose registration methods for global views, right-panel tabs, workspace-selection views, insert-link types, document imports, language-model contributions, and node presentations
- **AND** the system MUST NOT require a generic token-based extension registry for this change

### Requirement: Contribution identifiers MUST remain unique and removable per plugin
Every registered contribution MUST have a unique identifier within its extension point so host rendering keys and route paths stay stable. The plugin system MUST reject or roll back duplicate registrations and MUST be able to remove all contributions belonging to a single plugin.

#### Scenario: Reject duplicate contribution identifiers
- **WHEN** two contributions for the same extension point register the same identifier
- **THEN** the system MUST treat that as a plugin registration failure for the offending plugin
- **AND** previously registered contributions owned by that plugin MUST be removed

#### Scenario: Remove contributions by plugin ownership
- **WHEN** the plugin system deactivates a plugin or rolls back a failed activation
- **THEN** the system MUST remove all global views, right-panel tabs, workspace-selection views, insert-link types, document imports, language-model contributions, and node presentations owned by that plugin
- **AND** contributions from other plugins MUST remain intact

## ADDED Requirements

### Requirement: The plugin system MUST expose document import contributions as a first-class extension point
The plugin system MUST expose plugin-contributed document import sources as a read-only extension point that shared workspace UI can query and invoke through host-owned orchestration.

#### Scenario: Query registered document import sources
- **WHEN** shared workspace UI reads the contribution query for import capabilities
- **THEN** the system MUST return all registered document import contributions through a read-only getter
- **AND** the UI MUST NOT need direct access to mutable plugin registration APIs

#### Scenario: Keep document import ownership in the plugin boundary
- **WHEN** a document import source is invoked by the workspace host
- **THEN** the plugin contribution MUST own source-specific import logic
- **AND** the shared workspace shell MUST remain responsible only for wizard hosting and document-opening lifecycle

### Requirement: The plugin system MUST expose shared language-model contributions
The plugin system MUST allow plugins to register generic language-model text-generation capability and MUST expose those contributions to other plugins and shared UI through `ContributionQuery`.

#### Scenario: Query language-model capability from another plugin
- **WHEN** a plugin or shared UI reads the contribution query for language-model capability
- **THEN** the system MUST return the currently registered language-model contributions through a read-only getter
- **AND** callers MUST be able to detect when no language-model contribution is available

#### Scenario: Remove language-model capability with plugin deactivation
- **WHEN** a plugin that registered a language-model contribution is disabled or fails during setup
- **THEN** the language-model contribution MUST disappear from the contribution query
- **AND** remaining plugin contributions from other enabled plugins MUST continue to work
