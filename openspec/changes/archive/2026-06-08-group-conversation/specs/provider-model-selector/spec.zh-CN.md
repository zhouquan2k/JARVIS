> **语言**: [English](spec.md) | 中文

## ADDED Requirements

### Requirement: Model selector MUST expose the group provider with team presets
provider/model 选择器 SHALL 列出 `group` provider，其级联 model 列表 SHALL 把已配置的团队预设作为可选 model 呈现。选择某预设 SHALL 把该团队预设绑定到会话。

#### Scenario: Group presets appear as model choices
- **WHEN** 用户为 `group` provider 打开 model 选择器
- **THEN** 级联 model 列表 MUST 把每个已配置团队预设作为可选项呈现
- **AND** 选择某预设 MUST 把该预设绑定到会话

### Requirement: Model selector MUST expose desktop-only DOM providers
在 desktop runtime 下，选择器 SHALL 列出 `chatgpt-dom` 与 `gemini-dom` provider，与现有 `chatgpt-web` 并列。这些 DOM provider SHALL NOT 在 web 或 extension runtime 出现。

#### Scenario: DOM providers visible on desktop
- **WHEN** 在 desktop runtime 打开选择器
- **THEN** `chatgpt-dom` 与 `gemini-dom` MUST 与 `chatgpt-web` 并列可选

#### Scenario: DOM providers hidden off desktop
- **WHEN** 在 web 或 extension runtime 打开选择器
- **THEN** `chatgpt-dom` 与 `gemini-dom` MUST NOT 出现
