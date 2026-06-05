English | [Chinese](spec.zh-CN.md)

## Purpose

Define the plugin-system capability that governs how frontend hosts activate builtin plugins, expose plugin contributions to shared UI, and keep optional feature ownership inside plugin boundaries.

## Requirements

### Requirement: Frontend hosts MUST activate only enabled builtin plugins
Each frontend host MUST compose a static builtin plugin list, read a global plugin enablement configuration, and activate only the plugins that are enabled for that host. Disabled plugins MUST NOT contribute global views, right-panel tabs, or document-creation flows to the running application shell.

#### Scenario: Activate only configured plugins at host startup
- **WHEN** a host starts with a builtin plugin list and `enabledPluginIds`
- **THEN** the system MUST call `setup()` only for plugins resolved as enabled
- **AND** contributions from plugins outside that enabled set MUST NOT appear in the host contribution query

#### Scenario: Fall back to plugin defaults only when config is absent for a plugin
- **WHEN** a builtin plugin is not explicitly listed in `enabledPluginIds`
- **THEN** the system MAY use that plugin manifest's `defaultEnabled` value as the fallback
- **AND** an explicit config whitelist entry MUST take precedence over `defaultEnabled`

### Requirement: Plugin activation MUST be isolated per plugin
The plugin system MUST isolate plugin activation failures so a single broken plugin cannot prevent the frontend host shell from loading. If a plugin throws during activation, the system MUST log the failure, remove any partial contributions registered by that plugin, and continue activating the remaining enabled plugins.

#### Scenario: Continue host startup after one plugin fails
- **WHEN** one enabled plugin throws while its `setup()` is running
- **THEN** the host shell MUST continue activating the remaining enabled plugins
- **AND** contributions from the failed plugin MUST NOT remain registered

#### Scenario: Successful plugins remain available after a neighbor fails
- **WHEN** one plugin fails during activation and another enabled plugin succeeds
- **THEN** the successful plugin's contributions MUST remain queryable by the host UI
- **AND** the failed plugin MUST NOT appear in the enabled plugin set

### Requirement: Core contracts MUST define the initial plugin contribution model
The shared core contracts MUST define a minimal plugin contract surface that is frontend-runtime agnostic and supports the concrete contribution types currently required in this phase: global views, right-panel tabs, workspace-selection views, insert-link types, document-creation flows, and node presentations.

#### Scenario: Export plugin contracts from core without runtime host coupling
- **WHEN** shared packages or hosts import plugin contracts
- **THEN** the system MUST provide `PluginManifest`, `PluginEnablementConfig`, `PluginSetupApi`, and `ContributionQuery` from `packages/core`
- **AND** those contracts MUST NOT require importing the plugin-system runtime implementation

#### Scenario: Register only the concrete contribution types defined for this phase
- **WHEN** a plugin receives the setup API in this phase
- **THEN** the setup API MUST expose registration methods for global views, right-panel tabs, workspace-selection views, insert-link types, document-creation flows, and node presentations
- **AND** the system MUST NOT require a generic token-based extension registry for this change

### Requirement: Plugin contributions MUST be queryable through a read-only registry contract
The plugin system MUST aggregate enabled-plugin contributions in a runtime registry that implements a read-only contribution query contract for shared UI consumers. The query surface MUST return all registered contributions for each extension point and MUST preserve deterministic ordering.

#### Scenario: Query global views and right-panel tabs without mutable runtime access
- **WHEN** shared UI reads the injected contribution query
- **THEN** the system MUST return the currently registered global views and right-panel tabs through read-only getters
- **AND** the UI MUST NOT need direct access to plugin activation or registration methods

#### Scenario: Keep contribution ordering deterministic
- **WHEN** multiple enabled plugins contribute to the same extension point
- **THEN** the system MUST return those contributions in a deterministic order
- **AND** any contribution type with an `order` field MUST honor that field before fallback registration order

#### Scenario: Query workspace-core extension points without mutable runtime access
- **WHEN** shared UI reads the injected contribution query for workspace-selection views, insert-link types, or node presentations
- **THEN** the system MUST return those contributions through read-only getters on `ContributionQuery`
- **AND** the UI MUST NOT need direct access to plugin activation or registration methods

### Requirement: Contribution identifiers MUST remain unique and removable per plugin
Every registered contribution MUST have a unique identifier within its extension point so host rendering keys and route paths stay stable. The plugin system MUST reject or roll back duplicate registrations and MUST be able to remove all contributions belonging to a single plugin.

#### Scenario: Reject duplicate contribution identifiers
- **WHEN** two contributions for the same extension point register the same identifier
- **THEN** the system MUST treat that as a plugin registration failure for the offending plugin
- **AND** previously registered contributions owned by that plugin MUST be removed

#### Scenario: Remove contributions by plugin ownership
- **WHEN** the plugin system deactivates a plugin or rolls back a failed activation
- **THEN** the system MUST remove all global views, right-panel tabs, workspace-selection views, insert-link types, document-creation flows, and node presentations owned by that plugin
- **AND** contributions from other plugins MUST remain intact

### Requirement: Host UI surfaces MUST be assembled from plugin contributions
The frontend host shell MUST assemble top-level global views and Workspace right-panel tabs from plugin contributions instead of hardcoded feature imports. When the AI and task plugins are enabled, the host MUST expose the current chat/task surfaces through those contributions; when either plugin is disabled, the corresponding surface MUST disappear without breaking the Markdown document workspace core.

#### Scenario: Render enabled plugin views through contribution-driven assembly
- **WHEN** the AI plugin and task plugin are both enabled
- **THEN** the host MUST expose their registered global views in the top-level workspace shell
- **AND** the Workspace right panel MUST render the registered conversation and task tabs from plugin contributions

#### Scenario: Keep document workspace core available when optional plugins are disabled
- **WHEN** one or more optional plugins are disabled
- **THEN** the Markdown document workspace core MUST remain usable
- **AND** only the disabled plugin's registered surfaces MUST be absent from host assembly

### Requirement: Workspace-core UI MUST consume the additional named extension points through ContributionQuery
Shared workspace-core UI MAY remain the rendering host for document-centered workflows, but it MUST consume plugin-provided workspace-selection views, insert-link types, and node presentations only through `ContributionQuery`.

#### Scenario: Render workspace selection views through plugin contributions
- **WHEN** `DocumentWorkspaceView` needs to resolve the active workspace-selection companion view
- **THEN** it MUST select from plugin-registered workspace-selection views via `ContributionQuery`
- **AND** the shared workspace shell MUST NOT hardcode AI-specific selection panels

#### Scenario: Extend Markdown link insertion through plugin contributions
- **WHEN** `DocumentWorkspaceView` or its editor surface prepares insert-link choices
- **THEN** it MUST collect supported plugin-registered insert-link types via `ContributionQuery`
- **AND** the shared workspace shell MUST NOT hardcode plugin-specific link sources

#### Scenario: Decorate file-tree nodes through plugin contributions
- **WHEN** `DocumentFileTree` resolves visual enhancements for a node
- **THEN** it MUST query plugin-registered node presentations via `ContributionQuery`
- **AND** the shared workspace shell MUST keep node rendering stable when no plugin contribution matches

### Requirement: Hosts MUST load optional AI capabilities through plugin activation boundaries
Frontend hosts MAY know builtin plugin manifests, enablement rules, and plugin-loading mechanics, but they MUST NOT rely on direct hardcoded imports of optional AI feature implementations as the primary assembly mechanism. Optional AI capabilities MUST enter the host through plugin activation and registered contributions or plugin-owned service boundaries.

#### Scenario: Assemble optional AI surfaces without hardwiring concrete AI implementations
- **WHEN** a host enables the AI plugin
- **THEN** the host MUST expose AI-owned surfaces through plugin activation results rather than treating concrete AI runtime/provider implementations as built-in host features
- **AND** disabling the AI plugin MUST remove those optional surfaces without requiring host-shell rewrites

#### Scenario: Keep plugin loading as the host-owned integration point
- **WHEN** a host composes builtin plugins at startup
- **THEN** the host MAY statically declare the builtin plugin list
- **AND** the host MUST use plugin loading and registration as the integration boundary for optional capabilities

### Requirement: Optional feature implementations MUST be owned by their plugins
The plugin boundary for optional frontend capabilities MUST include both registration and concrete feature implementation ownership. Shared UI packages MAY host workspace-core shells and reusable primitives, but they MUST NOT remain the long-term owner of AI-specific or task-specific feature surfaces after extraction.

#### Scenario: AI plugin owns the chat and conversation feature surfaces it contributes
- **WHEN** the AI plugin contributes a global chat surface or a Workspace right-panel conversation tab
- **THEN** the contributed implementation MUST be defined under the AI plugin package rather than imported back from a shared `packages/ui` feature component
- **AND** AI-specific conversation/history/compare UI MUST be treated as AI plugin-owned code

#### Scenario: Task plugin owns the task surfaces it contributes
- **WHEN** the task plugin contributes an all-tasks global surface or a Workspace right-panel task tab
- **THEN** the contributed implementation MUST be defined under the task plugin package rather than imported back from a shared `packages/ui` feature component
- **AND** task list/editor UI MUST be treated as task plugin-owned code

#### Scenario: Shared workspace shells stay feature-agnostic
- **WHEN** `packages/ui` renders workspace shells such as the host app or the Workspace right panel
- **THEN** those shells MUST consume `ContributionQuery` without embedding built-in AI/task fallback implementations
- **AND** disabling optional plugins MUST remove their surfaces without requiring shared-shell feature rewrites

### Requirement: Host and context code MUST depend on the narrowest conversation-query contract they need
Host-side and context-side workspace implementations that only need conversation lookup MUST depend on a minimal conversation-query contract, rather than directly owning broad AI conversation-domain implementations. Shared usage across hosts does not by itself make the AI conversation domain part of workspace core ownership.

#### Scenario: Delegate conversation lookup through a narrow query contract
- **WHEN** a context-oriented workspace implementation needs to retrieve conversations for document or scope lookup
- **THEN** it MUST depend on a minimal query-facing contract such as `IConversationQueryProvider`
- **AND** it MUST NOT require unrelated AI runtime/provider/storage ownership to perform that lookup

#### Scenario: Preserve workspace-core ownership while AI contracts move under the AI plugin
- **WHEN** AI conversation-domain contracts are extracted from `packages/core` into AI-plugin-owned shared contracts
- **THEN** host-side and context-side code that only depends on minimal query contracts SHOULD remain largely stable
- **AND** the extraction MUST NOT force those workspace-core components to become owners of broader AI feature implementations

### Requirement: The plugin system MUST reserve a document-creation-flow extension point
The plugin system MUST support plugin-contributed document-creation flows as a controlled extension point around the core Markdown document creation process. These flows MUST remain host-mediated and MUST return the created document path when they succeed.

#### Scenario: Register a custom document-creation flow
- **WHEN** a plugin registers a document-creation-flow contribution
- **THEN** the system MUST expose that flow through the contribution query
- **AND** the contribution MUST provide a title and an async execution entry point

#### Scenario: Return the created document path from a successful flow
- **WHEN** the host invokes a registered document-creation flow and the flow succeeds
- **THEN** the flow MUST resolve with the created document path
- **AND** the plugin system MUST keep the core document workspace as the authority for subsequent document opening and editing
