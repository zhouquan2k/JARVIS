## ADDED Requirements

### Requirement: Knowledge context provider MUST expose task-provider resolution through the shared context contract
The knowledge context provider MUST expose task access through `IContextProvider.getTaskProvider()` so workspace UI code can resolve scoped task operations through the same context provider that already resolves documents and conversations.

#### Scenario: Resolve task operations through a local or remote context provider
- **WHEN** the workspace runs with a filesystem-backed, database-backed, desktop-bridge, or HTTP-backed context provider
- **THEN** that provider MUST expose `getTaskProvider()`
- **AND** callers MUST be able to use the returned task provider without needing a second scope-discovery mechanism

#### Scenario: Preserve conversation and document lookup behavior while adding task access
- **WHEN** task-provider resolution is added to the knowledge context provider contract
- **THEN** existing document and conversation lookup behaviors MUST remain available through the same context provider
- **AND** adding task access MUST NOT change the semantics of document reads, document writes, or conversation queries
