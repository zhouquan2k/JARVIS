> **语言**: [English](spec.md) | 中文

## ADDED Requirements

### Requirement: Runtime MUST construct the group provider via special-case injection
当 `getProvider` 请求 `providerId === 'group'` 时，runtime SHALL 用注入依赖构造 group provider——`resolveMemberProvider(id)` 委派给 `getProvider(id, { fresh: true })`，`getGroupConfig()` 读取当前所选团队预设——且 SHALL NOT 把 group 加入模块级默认工厂表。

#### Scenario: Group constructed with injected dependencies
- **WHEN** 调用 `getProvider('group')`
- **THEN** runtime MUST 返回一个成员解析委派给 `getProvider(id, { fresh: true })` 的 group provider
- **AND** group provider MUST 从当前所选团队预设读取成员

#### Scenario: Group not registered in default factories
- **WHEN** 检视模块级默认 provider 工厂
- **THEN** `group` MUST NOT 作为默认工厂条目存在

### Requirement: Runtime MUST register DOM-automation providers only in desktop mode
runtime SHALL 仅在 runtime 模式为 desktop 时提供 `chatgpt-dom` 与 `gemini-dom`。在 web 或 extension 模式下，请求这些 provider SHALL 以不可用失败。

#### Scenario: DOM providers available on desktop
- **WHEN** runtime 模式为 desktop
- **THEN** `getProvider('chatgpt-dom')` 与 `getProvider('gemini-dom')` MUST 返回 DOM 自动化 provider 实例

#### Scenario: DOM providers unavailable off desktop
- **WHEN** runtime 模式为 web 或 extension
- **THEN** 请求 `chatgpt-dom` 或 `gemini-dom` MUST 以「该 runtime 模式不可用」失败
