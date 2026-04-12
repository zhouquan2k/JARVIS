# ui-localization-runtime Specification

## Purpose
TBD - created by archiving change i18n-2. Update Purpose after archive.
## Requirements
### Requirement: Shared UI localization runtime MUST support English and Simplified Chinese
共享 UI 国际化运行时 MUST 支持 `en` 与 `zh-CN` 两种 locale，并为 Web、Extension、Desktop 三个宿主提供统一的消息读取、语言切换与当前 locale 访问能力。

#### Scenario: Host reads localized copy through shared runtime
- **WHEN** 任一宿主渲染共享 UI 组件或视图
- **THEN** 系统 MUST 通过共享 UI 国际化运行时解析当前 locale
- **AND** 组件 MUST 能基于该 locale 读取对应的消息资源

#### Scenario: Supported locale is constrained to Phase 2 scope
- **WHEN** 宿主初始化共享 UI 国际化运行时
- **THEN** 系统 MUST 至少支持 `en` 与 `zh-CN`
- **AND** 系统 MUST NOT 要求在 Phase 2 中支持其他语言

### Requirement: Locale initialization MUST prefer persisted user choice
共享 UI 国际化运行时 MUST 按“持久化用户选择 > 宿主语言 > 默认英文”的顺序解析初始 locale，保证用户显式选择的语言在刷新或重启后仍然生效。

#### Scenario: Persisted locale overrides host language
- **WHEN** 本地存储中已经存在用户选择的 locale
- **THEN** 宿主启动时 MUST 优先恢复该 locale
- **AND** 系统 MUST NOT 因宿主语言不同而覆盖该选择

#### Scenario: Host language is used when persisted locale is absent
- **WHEN** 本地存储中不存在已保存的 locale
- **THEN** 系统 MUST 根据浏览器或宿主语言解析 `en` 或 `zh-CN`
- **AND** 无法识别时 MUST 回退到 `en`

### Requirement: All three hosts MUST install the shared localization runtime before mount
Web、Extension、Desktop 三个宿主 MUST 在应用挂载前安装共享 UI 国际化运行时，确保首屏渲染即使用正确 locale，而不是在挂载后再异步修正文案。

#### Scenario: Web host installs localization runtime before mount
- **WHEN** Web 宿主启动应用
- **THEN** 宿主 MUST 在 `app.mount()` 之前安装共享 UI 国际化运行时

#### Scenario: Extension and Desktop hosts install the same runtime contract
- **WHEN** Extension 或 Desktop 宿主启动应用
- **THEN** 宿主 MUST 在 `app.mount()` 之前安装同一套共享 UI 国际化运行时
- **AND** 运行时契约 MUST 与 Web 宿主保持一致

### Requirement: Locale switching MUST persist and update the current UI session
用户在 UI 中切换语言时，系统 MUST 立即刷新当前会话中的静态文案，并将所选 locale 持久化，以供后续刷新和重启恢复。

#### Scenario: Switching locale updates visible UI copy
- **WHEN** 用户通过语言切换入口将 locale 从 `zh-CN` 切换到 `en`
- **THEN** 当前界面中的静态可见文案 MUST 切换为英文

#### Scenario: Switched locale survives refresh
- **WHEN** 用户切换 locale 后刷新页面或重启宿主
- **THEN** 系统 MUST 恢复上一次保存的 locale

