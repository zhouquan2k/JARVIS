## Why

当前仓库面向 GitHub 开源展示时，公开入口文档与架构主入口仍以中文为主，这会直接提高英文开发者的理解门槛，也使仓库对外形象与后续 UI 国际化目标不一致。先独立完成 Phase 1 的仓库公开入口英文化，可以在不触碰运行时代码的前提下，先稳定对外默认英文入口、文档互链规则与架构主入口。

## What Changes

- 将仓库公开入口调整为英文主文档，中文通过显式镜像入口访问。
- 新增或重构根级公开文档，包括 `README.md`、`CONTRIBUTING.md`、`ARCHITECTURE.md`、`SECURITY.md`、`CODE_OF_CONDUCT.md`、`LICENSE` 及对应中文镜像文档。
- 将 `docs/workspace.dsl` 调整为英文主版本，并补充 `docs/zh/workspace.zh-CN.dsl` 作为中文镜像。
- 为核心公开文档建立 `English | 中文` 双向互链约定，并将中文镜像集中到 `docs/zh/`。
- 新增仓库级术语表，统一后续 Phase 2/3 使用的中英文术语。
- 补齐仓库元数据，包括 `package.json` 中对外描述字段。
- `ARCHITECTURE.md` 基于 `workspace.dsl` 中的 context 图和 container 图编写。
- 本阶段不处理历史文档迁移、UI i18n、异常文案治理、OpenSpec 存量双语补齐。

## Capabilities

### New Capabilities
- `repository-public-docs`: 定义仓库对外公开文档、默认英文入口、中文镜像与互链规则。
- `architecture-entry-docs`: 定义公开架构主入口文档与 `workspace.dsl` 的英文主版本及镜像组织方式。

### Modified Capabilities
- `<none>`: 本阶段不修改现有运行时能力规格，仅新增面向仓库公开入口与文档治理的能力定义。

## Impact

- 影响仓库根级公开文档与仓库元数据。
- 影响 `docs/` 下公开文档的组织结构、命名和互链规范。
- 影响 `docs/workspace.dsl` 及其衍生架构说明入口。
- 影响仓库级术语规范，为后续 Phase 2/3 提供统一词汇基线。
- 不影响 Web、Extension、Desktop、Server 的运行时行为与现有接口。
