> **Language**: English | [中文](spec.zh-CN.md)

## ADDED Requirements

### Requirement: Runtime MUST construct the group provider via special-case injection
When `getProvider` is asked for `providerId === 'group'`, the runtime SHALL construct the group provider with injected dependencies — `resolveMemberProvider(id)` delegating to `getProvider(id, { fresh: true })`, and `getGroupConfig()` reading the currently selected team preset — without adding the group to the module-level default factory map.

#### Scenario: Group constructed with injected dependencies
- **WHEN** `getProvider('group')` is called
- **THEN** the runtime MUST return a group provider whose member resolution delegates to `getProvider(id, { fresh: true })`
- **AND** the group provider MUST read its members from the currently selected team preset

#### Scenario: Group not registered in default factories
- **WHEN** the module-level default provider factories are inspected
- **THEN** `group` MUST NOT be present as a default factory entry

### Requirement: Runtime MUST register DOM-automation providers only in desktop mode
The runtime SHALL make `chatgpt-dom` and `gemini-dom` available only when the runtime mode is desktop. In web or extension modes, requesting these providers SHALL fail as unavailable.

#### Scenario: DOM providers available on desktop
- **WHEN** the runtime mode is desktop
- **THEN** `getProvider('chatgpt-dom')` and `getProvider('gemini-dom')` MUST return DOM-automation provider instances

#### Scenario: DOM providers unavailable off desktop
- **WHEN** the runtime mode is web or extension
- **THEN** requesting `chatgpt-dom` or `gemini-dom` MUST fail as not available in that runtime mode
