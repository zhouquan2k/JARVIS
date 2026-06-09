> **Language**: English | [中文](spec.zh-CN.md)

## ADDED Requirements

### Requirement: APP_CONFIG MUST define a group pseudo-provider with team presets
`APP_CONFIG.providers` SHALL include a provider entry with `id: 'group'` whose `models` list represents selectable team presets and whose `defaultModel` names the default preset. The configuration SHALL also define, for each preset, the list of member entries `{ providerId, modelId, name }`.

#### Scenario: Group pseudo-provider present in config
- **WHEN** `APP_CONFIG.providers` is read
- **THEN** it MUST contain an entry with `id: 'group'`
- **AND** that entry's `models` MUST list the available team presets
- **AND** that entry MUST declare a `defaultModel` naming the default preset

#### Scenario: Each preset declares its members
- **WHEN** a team preset is resolved from configuration
- **THEN** the configuration MUST provide that preset's member list as `{ providerId, modelId, name }` entries
