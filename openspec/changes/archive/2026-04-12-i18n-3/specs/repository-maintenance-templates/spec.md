English | [中文](spec.zh-CN.md)

## ADDED Requirements

### Requirement: Repository SHALL provide English-first GitHub templates
仓库 SHALL 提供英文优先的 `.github` issue / PR 模板，用于引导贡献者检查 UI 文案、异常文案和 OpenSpec 双语文档要求。

#### Scenario: Contributor opens a pull request
- **WHEN** 贡献者创建 PR
- **THEN** PR 模板 MUST 包含 UI i18n、异常英文默认消息和 OpenSpec 双语文件检查项

### Requirement: CONTRIBUTING SHALL document copy and OpenSpec maintenance rules
`CONTRIBUTING.md` SHALL 明确记录后续维护规则：新增静态用户可见 UI 文案必须进入 UI i18n，用户可见异常必须使用英文默认消息，正式 OpenSpec 文档必须中英成对提交。

#### Scenario: Contributor adds static UI copy
- **WHEN** 贡献者新增静态用户可见 UI 文案
- **THEN** `CONTRIBUTING.md` MUST 要求该文案进入 UI i18n 资源

#### Scenario: Contributor adds user-visible error copy
- **WHEN** 贡献者新增用户可见异常或错误提示
- **THEN** `CONTRIBUTING.md` MUST 要求使用英文默认消息，而不是新增异常多语言词条

#### Scenario: Contributor adds formal OpenSpec docs
- **WHEN** 贡献者新增正式 OpenSpec spec 或活跃 change artifact
- **THEN** `CONTRIBUTING.md` MUST 要求同步提交英文主文件和中文镜像文件

### Requirement: Chinese contributing mirror SHALL match the English rules
`CONTRIBUTING.zh-CN.md` SHALL 保持与英文贡献规则语义一致，确保中文维护者看到相同的文案、异常和 OpenSpec 双语要求。

#### Scenario: Chinese contributor reads contributing guide
- **WHEN** 中文贡献者查阅 `CONTRIBUTING.zh-CN.md`
- **THEN** 文档 MUST 包含与 `CONTRIBUTING.md` 等价的维护规则
