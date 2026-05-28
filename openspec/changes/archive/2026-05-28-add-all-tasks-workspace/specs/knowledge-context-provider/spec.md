## MODIFIED Requirements

### Requirement: Knowledge context provider MUST expose task-provider resolution through the shared context contract
The system MUST expose task-domain operations through `IContextProvider.getTaskProvider()` rather than flattening task CRUD methods directly into the general context-provider contract. The resolved task provider MUST preserve the same query semantics across local, desktop-bridge, and HTTP-backed providers, including support for global task queries and tag-based subset filtering.

#### Scenario: Resolve task operations through a local or remote context provider
- **WHEN** workspace UI code needs task operations for the current scope
- **THEN** it MUST obtain them through `IContextProvider.getTaskProvider()`
- **AND** the returned object MUST implement the shared `ITaskProvider` contract

#### Scenario: Preserve conversation and document lookup behavior while adding task access
- **WHEN** the task contract is added to the workspace context architecture
- **THEN** existing document, node, and conversation access behaviors MUST remain available as separate capabilities
- **AND** task mutation operations MUST NOT replace or alter those existing contracts

#### Scenario: Forward global task queries and tag filters through provider boundaries
- **WHEN** caller code requests `getTasks(null, null, completed, tag)` through a filesystem-backed, desktop-bridge, database-backed, or HTTP-backed context provider
- **THEN** the provider chain MUST preserve the null/null global-query semantics and requested tag filter
- **AND** callers MUST NOT need host-specific task-query workarounds

