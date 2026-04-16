English | [Chinese](spec.zh-CN.md)

## ADDED Requirements

### Requirement: Execute dual-model generation concurrently
The concurrent scheduling controller MUST support running the streaming conversation calls for Model A and Model B in parallel within a single request, rather than serially.

#### Scenario: Controller starts two model streams in one workflow
- **WHEN** the user submits a comparison question and triggers the compare workflow
- **THEN** the controller MUST start Model A and Model B requests at the same time
- **AND** both outputs MUST be returned to the caller through separate callback channels.

### Requirement: Trigger analyzer only after both model outputs complete
The controller MUST start the analysis engine only after both model streams have finished, and it MUST pass the complete `outputA` and `outputB` as analysis inputs.

#### Scenario: Analyzer waits for both model responses
- **WHEN** only one model has finished and the other is still generating
- **THEN** the controller MUST NOT start the analysis engine
- **AND** the analysis flow MUST only be invoked after both streams are complete.

### Requirement: Expose compare workflow lifecycle to UI
The controller MUST expose an observable compare workflow lifecycle to the UI, including key stages such as generating, analyzing, completed, and failed.

#### Scenario: UI can render stage-specific state
- **WHEN** the compare workflow moves from the generation stage to the analysis stage
- **THEN** the controller MUST emit a stage transition signal
- **AND** the UI MUST be able to switch loading, analysis-panel, or error-state presentation based on that signal.
