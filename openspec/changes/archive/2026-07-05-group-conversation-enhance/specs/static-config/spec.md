English | [Chinese](spec.zh-CN.md)

## ADDED Requirements

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
