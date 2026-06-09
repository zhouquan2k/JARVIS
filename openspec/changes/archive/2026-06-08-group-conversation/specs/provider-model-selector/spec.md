> **Language**: English | [中文](spec.zh-CN.md)

## ADDED Requirements

### Requirement: Model selector MUST expose the group provider with team presets
The provider/model selector SHALL list the `group` provider, and its cascading model list SHALL present the configured team presets as selectable models. Selecting a preset SHALL bind that team preset to the conversation.

#### Scenario: Group presets appear as model choices
- **WHEN** the user opens the model selector for the `group` provider
- **THEN** the cascading model list MUST present each configured team preset as a selectable entry
- **AND** selecting a preset MUST bind that preset to the conversation

### Requirement: Model selector MUST expose desktop-only DOM providers
The selector SHALL list the `chatgpt-dom` and `gemini-dom` providers when running in the desktop runtime, alongside the existing `chatgpt-web` provider. These DOM providers SHALL NOT appear in web or extension runtimes.

#### Scenario: DOM providers visible on desktop
- **WHEN** the selector is opened in the desktop runtime
- **THEN** `chatgpt-dom` and `gemini-dom` MUST be selectable alongside `chatgpt-web`

#### Scenario: DOM providers hidden off desktop
- **WHEN** the selector is opened in a web or extension runtime
- **THEN** `chatgpt-dom` and `gemini-dom` MUST NOT appear
