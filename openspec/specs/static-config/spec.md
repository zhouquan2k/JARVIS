English | [Chinese](spec.zh-CN.md)

## Purpose
Define static configuration contracts that control sync namespace selection and environment-specific defaults.
## Requirements
### Requirement: System MUST provide a `syncKey` setting for remote namespace selection
The system MUST provide a `syncKey` setting as the remote synchronization namespace identifier, and the host MUST read that setting first when initializing sync capabilities.

#### Scenario: Host reads syncKey from settings
- **WHEN** the Web or Extension host initializes the sync storage provider
- **THEN** the system MUST read the current `syncKey` setting
- **AND** subsequent `pull`, `push`, and sync-cursor persistence MUST use that `syncKey` as the namespace identifier

### Requirement: Default `syncKey` zero MUST be development-only
The system MAY provide a default `syncKey = "0"` for development convenience, but that default value MUST be limited to development environments.

#### Scenario: Development environment uses default syncKey
- **WHEN** the host is running in a development environment and the user has not configured `syncKey`
- **THEN** the system MUST allow sync capabilities to initialize with the default value `0`

#### Scenario: Non-development environment rejects default syncKey
- **WHEN** the host is running in a non-development environment and the current `syncKey` is still `0`
- **THEN** the system MUST block sync initialization
- **AND** the system MUST prompt the user to configure a real `syncKey`

### Requirement: APP_CONFIG MUST support groupSummarizers at preset level
`APP_CONFIG` SHALL include a `groupSummarizers` record keyed by group preset ID. Each entry SHALL declare the `providerId`, `modelId`, and an optional `systemPrompt` for the summarizer. The runtime SHALL use this configuration to resolve the summarizer when processing a group turn.

#### Scenario: groupSummarizers entry provides summarizer for a preset
- **WHEN** `APP_CONFIG.groupSummarizers[presetId]` is defined
- **THEN** `createModelProviderRuntime` MUST resolve the declared `providerId` and `modelId` as the summarizer for that preset

#### Scenario: Missing groupSummarizers entry disables summarization
- **WHEN** `APP_CONFIG.groupSummarizers[presetId]` is undefined or the key is absent
- **THEN** the runtime MUST treat summarization as disabled for that preset
- **AND** no `groupSummary` field SHALL be produced for turns using that preset

#### Scenario: groupSummarizers systemPrompt is applied when present
- **WHEN** `GroupSummarizerConfig.systemPrompt` is provided
- **THEN** the system MUST use that value as the summarizer model's system prompt
- **AND** it MUST override the default summarizer system prompt defined in `groupSummaryPrompt.ts`

