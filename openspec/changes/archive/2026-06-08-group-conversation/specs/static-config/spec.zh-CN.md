> **语言**: [English](spec.md) | 中文

## ADDED Requirements

### Requirement: APP_CONFIG MUST define a group pseudo-provider with team presets
`APP_CONFIG.providers` SHALL 包含一个 `id: 'group'` 的 provider 条目，其 `models` 列表表示可选团队预设，`defaultModel` 指定默认预设。配置 SHALL 同时为每个预设定义成员条目清单 `{ providerId, modelId, name }`。

#### Scenario: Group pseudo-provider present in config
- **WHEN** 读取 `APP_CONFIG.providers`
- **THEN** 其 MUST 包含一个 `id: 'group'` 条目
- **AND** 该条目的 `models` MUST 列出可用团队预设
- **AND** 该条目 MUST 声明指定默认预设的 `defaultModel`

#### Scenario: Each preset declares its members
- **WHEN** 从配置解析某团队预设
- **THEN** 配置 MUST 提供该预设的成员清单，形如 `{ providerId, modelId, name }` 条目
