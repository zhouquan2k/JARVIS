# localized-ui-copy Specification

## Purpose
TBD - created by archiving change i18n-2. Update Purpose after archive.
## Requirements
### Requirement: Shared static UI copy MUST be localized through translation keys
共享 UI 中直接面向用户展示的静态文案 MUST 通过 translation key 渲染，而不得继续以内联硬编码字符串作为唯一文案来源。该要求 SHALL 覆盖按钮、标签、空态、占位符、菜单、面板标题和静态提示语。

#### Scenario: Static labels in shared views are localized
- **WHEN** 用户切换共享聊天或对比视图的 locale
- **THEN** 视图中的静态标签、按钮和占位符 MUST 切换到对应语言

#### Scenario: Static labels in shared components are localized
- **WHEN** 用户查看共享组件中的空态、菜单和面板标题
- **THEN** 这些静态文案 MUST 通过 translation key 渲染

### Requirement: Route labels and workspace navigation copy MUST be localized
共享工作区路由标签和导航文案 MUST 支持 locale 切换，保证顶栏和工作区切换入口在三宿主中呈现一致的本地化结果。

#### Scenario: Route labels switch with locale
- **WHEN** 用户切换 locale
- **THEN** `packages/ui/src/routes.ts` 提供的工作区标签 MUST 切换到对应语言

### Requirement: Provider, model and option display copy MUST support localization keys
`packages/core/config.ts` 中面向用户的 provider / model / option 可见文本 MUST 支持 translation key；UI 渲染时 MUST 优先使用 translation key 对应文案，并在缺失时回退到英文 fallback。

#### Scenario: Provider selector renders localized provider labels
- **WHEN** 用户在不同 locale 下查看 provider selector
- **THEN** provider 名称 MUST 使用对应 locale 的文案

#### Scenario: Model option descriptions render localized copy with fallback
- **WHEN** 某个 model option 配置了 translation key
- **THEN** UI MUST 优先显示该 key 对应的本地化文案
- **AND** 当 key 缺失时 UI MUST 回退到配置中的英文原文

### Requirement: Phase 2 localization MUST exclude runtime error messages
Phase 2 的 UI 本地化 MUST 排除 `currentError`、`analysisError`、`throw new Error(...)` 以及其他运行时异常消息；这些文本 MAY 继续以原始字段展示，并 SHALL 在 Phase 3 单独治理。

#### Scenario: Error strings remain outside translation resources in Phase 2
- **WHEN** 系统在 Phase 2 中迁移共享 UI 文案
- **THEN** 运行时异常消息 MUST NOT 被要求进入翻译词条

### Requirement: Localized copy MUST follow the repository glossary
Phase 2 新增的 `en` 与 `zh-CN` 翻译词条 MUST 遵循 Phase 1 建立的仓库级术语表，避免在工作区、Agent、Provider、Context 等核心术语上出现用词漂移。

#### Scenario: Core UI terms stay consistent across locales
- **WHEN** 用户在不同 locale 下查看涉及工作区、Agent、Provider 或 Context 的文案
- **THEN** 翻译结果 MUST 与仓库级术语表中的中英文定义保持一致

