English | [Chinese](spec.zh-CN.md)

## ADDED Requirements

### Requirement: Run analyzer with configuration-driven provider and model
The analysis engine MUST read the default provider, default model, and system prompt template from `APP_CONFIG.analyzer`, and construct the final analysis request using the `{prompt}`, `{outputA}`, and `{outputB}` placeholders.

#### Scenario: Analyzer resolves provider and model from static config
- **WHEN** the system starts a comparison analysis request
- **THEN** the analysis engine MUST perform the analysis using the configured `defaultProvider` and `defaultModel`
- **AND** the prompt sent to the model MUST include the three placeholder values after substitution.

### Requirement: Stream analyzer output to caller
The analysis engine MUST support streaming passthrough and deliver each incremental chunk to the caller via callbacks before the analysis response has finished.

#### Scenario: Analyzer emits progressive updates
- **WHEN** the analysis provider returns streaming data chunks
- **THEN** the engine MUST trigger the `onUpdate` callback in receive order
- **AND** the caller MUST be able to consume these updates before the final result is complete.

### Requirement: Produce a structured five-field analysis result
The analysis engine MUST parse the final response into a structured result containing five fields: `agreements`, `conflictsA`, `conflictsB`, `uniqueA`, and `uniqueB`. Field content MUST primarily surface verbatim excerpts from the A/B original answers, either as strings or string arrays, rather than subjective commentary.

#### Scenario: Analyzer returns valid JSON payload
- **WHEN** the model finally returns a JSON string that satisfies the field constraints
- **THEN** the engine MUST successfully parse and return a complete `AnalysisResult`
- **AND** all five fields MUST be present and usable for UI rendering, while preserving the "content first, commentary minimal" semantics.

#### Scenario: Analyzer returns markdown-fenced JSON or array fields
- **WHEN** the model returns JSON wrapped in a Markdown code block, or field values are string arrays
- **THEN** the engine MUST be able to extract and parse the five-field result
- **AND** the upstream UI MUST continue rendering instead of entering a parsing-failure state directly.

#### Scenario: Analyzer returns invalid or incomplete JSON payload
- **WHEN** the model's final response cannot be parsed as JSON that satisfies the constraints
- **THEN** the engine MUST throw a recognizable parsing error
- **AND** the error message MUST allow the caller to trigger fallback display logic.
