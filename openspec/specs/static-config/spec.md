English | [中文](spec.zh-CN.md)

## ADDED Requirements

### Requirement: System MUST provide syncKey setting for remote namespace selection
系统 MUST 提供一个 `syncKey` 设置项作为远端同步命名空间标识，宿主在初始化同步能力时 MUST 优先读取该设置。

#### Scenario: Host reads syncKey from settings
- **WHEN** Web 或 Extension 宿主初始化同步存储 provider
- **THEN** 系统 MUST 读取当前设置中的 `syncKey`
- **AND** 后续 `pull`、`push` 与同步游标持久化 MUST 使用该 `syncKey` 作为命名空间标识

### Requirement: Default syncKey zero MUST be development-only
系统 MAY 为开发便利提供默认 `syncKey = "0"`，但该默认值 MUST 仅限开发环境使用。

#### Scenario: Development environment uses default syncKey
- **WHEN** 宿主运行于开发环境且用户未配置 `syncKey`
- **THEN** 系统 MUST 允许使用默认值 `0` 初始化同步能力

#### Scenario: Non-development environment rejects default syncKey
- **WHEN** 宿主运行于非开发环境且当前 `syncKey` 仍为 `0`
- **THEN** 系统 MUST 阻止同步初始化
- **AND** 系统 MUST 提示用户配置真实 `syncKey`

