English | [Chinese](spec.zh-CN.md)

## ADDED Requirements

### Requirement: External history provider MUST return first-page conversation summaries
The system MUST return external history summary lists through a dedicated `IExternalConversationProvider`, and it MUST allow different providers to support both "recent list" and optional keyword search through the same contract. When `getHistoryList()` is called without `query` or with an empty `query`, the system MUST return the most recent page of remote conversation summaries; when `query` is a non-empty string, the system MUST return the summary list for that provider's keyword search results.

#### Scenario: Fetch first page of external history through renamed provider contract
- **WHEN** the UI calls `getHistoryList()` on an external provider without passing `query` or with an empty string
- **THEN** the system MUST return the most recent page of remote conversation summaries through the `IExternalConversationProvider` contract
- **AND** each summary MUST include at least the external ID, title, updated time, and `origin`

#### Scenario: Keep search behavior stable during provider rename
- **WHEN** the caller migrates from `IHistoryProvider` to `IExternalConversationProvider`
- **THEN** `getHistoryList({ query })` MUST continue returning the summary list for the corresponding keyword search results
- **AND** the returned structure MUST keep the same `ConversationHistorySummary` contract as the recent list

### Requirement: External history provider MUST normalize detail into shared Conversation model
The system MUST convert external history details into the unified linear `Conversation` structure before handing them to the UI render and import flows. This detail-reading capability MUST remain unchanged after the interface rename.

#### Scenario: Keep detail normalization stable during provider rename
- **WHEN** the UI calls `getHistoryDetail(externalId)`
- **THEN** the system MUST return a normalized `Conversation`
- **AND** the result MUST continue to include `externalId`, `backendId`, `origin`, and linear `messages`

### Requirement: External history provider MUST select one renderable main branch from tree data
When external history details are in a tree-node structure, the system MUST select only one main branch that can continue the conversation and filter out node types not supported by the current UI.

#### Scenario: Flatten tree-like history detail
- **WHEN** the external history details contain branch nodes, system nodes, or tool nodes
- **THEN** the system MUST extract only the `user` and `assistant` messages on one main branch
- **AND** the system MUST filter out non-user/non-assistant nodes that cannot be stably rendered in the current chat UI

### Requirement: External history provider MUST expose recoverable provider-specific failures
The system MUST normalize provider-specific failures during external history fetching into recoverable errors so the UI does not misinterpret fetch failures as empty lists or empty details.

#### Scenario: Return normalized external history error
- **WHEN** an external provider encounters authentication failure, missing configuration, selector mismatch, or missing details
- **THEN** the system MUST return a failure result with a stable error code
- **AND** the UI MUST be able to display a readable message based on that error code rather than exposing the underlying exception text directly
