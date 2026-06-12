English | [Chinese](spec.zh-CN.md)

## Purpose
Define the visible provider selector and cascading model selector behavior in chat interfaces across supported hosts.

## Requirements
### Requirement: Group membership MUST be chosen via a top-of-conversation member checklist
The provider/model selector SHALL list the `group` provider. Once the `group` provider is selected, the participating members SHALL be chosen through a checklist rendered at the top of the conversation rather than through a fixed cascading preset model. The checklist SHALL present every configured group candidate (the desktop DOM providers available in the current runtime), with unselected candidates shown in a de-emphasized (greyed) state and selected candidates highlighted. The configured `dom-group` preset SHALL act only as the default selection for a fresh group conversation. The selection SHALL be persisted per conversation (`modelSelection.groupMembers`) and restored on load. At least one member MUST remain selected.

#### Scenario: Candidate members appear as a checklist
- **WHEN** the user selects the `group` provider for a conversation
- **THEN** the top of the conversation MUST present each available group candidate as a toggleable entry
- **AND** unselected candidates MUST be visually de-emphasized while selected candidates are highlighted
- **AND** a fresh group conversation MUST default to the configured `dom-group` preset members

#### Scenario: Toggling members updates and persists the selection
- **WHEN** the user toggles a candidate in the checklist
- **THEN** that member MUST be added to or removed from the participating set
- **AND** the resulting selection MUST be persisted to the conversation and restored when it is reopened
- **AND** the last remaining member MUST NOT be removable

#### Scenario: Selected member names double as @mention shortcuts
- **WHEN** the user clicks a member's name in the checklist
- **THEN** an `@member` mention MUST be inserted into the draft prompt

### Requirement: Model selector MUST expose desktop-only DOM providers
The selector SHALL list the `chatgpt-dom`, `gemini-dom`, and `claude-dom` providers when running in the desktop runtime, alongside the existing `chatgpt-web` provider. These DOM providers SHALL NOT appear in web or extension runtimes. Each DOM provider drives its respective AI site (`chat.openai.com`, `gemini.google.com`, `claude.ai`) via the controlled-page infrastructure. The `claude-dom` provider supports reasoning-effort control, defaulting to `high` (extended thinking).

#### Scenario: DOM providers visible on desktop
- **WHEN** the selector is opened in the desktop runtime
- **THEN** `chatgpt-dom`, `gemini-dom`, and `claude-dom` MUST be selectable alongside `chatgpt-web`

#### Scenario: DOM providers hidden off desktop
- **WHEN** the selector is opened in a web or extension runtime
- **THEN** `chatgpt-dom`, `gemini-dom`, and `claude-dom` MUST NOT appear

#### Scenario: claude-dom defaults to extended thinking
- **WHEN** the user selects `claude-dom` and sends a message without explicitly setting reasoning effort
- **THEN** the controlled page MUST apply the `high` reasoning-effort level (extended thinking) by default
