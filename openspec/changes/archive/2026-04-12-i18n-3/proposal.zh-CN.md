[English](proposal.md) | 中文

## 原因

Phase 1 已建立仓库英文公开入口，Phase 2 已规划 UI 静态文案国际化，但错误链路、正式 OpenSpec 文档和维护规范仍存在中英文边界不清的问题。Phase 3 需要单独收口这些分散且高风险的治理项：用户可见异常统一英文、正式 OpenSpec 双语分文件，以及贡献模板与规则补齐。

## 变更内容

- 将会透到 UI 的运行时异常和错误提示统一改为英文默认消息，不做异常多语言。
- 保留并复用已有错误码链路，如 `AUTH_REQUIRED`、`DETAIL_NOT_FOUND`、`SELECTOR_MISMATCH`，但不新增异常翻译字典。
- 将正式 OpenSpec 文档按英文主文件 + 中文镜像文件补齐，范围覆盖 `openspec/specs/**` 与活跃 change，不处理 `openspec/changes/archive/**`。
- 新增或补齐 `.github` issue / PR 模板，采用英文优先。
- 在 `CONTRIBUTING.md` 中补充后续维护规则：用户可见静态文案进入 UI i18n，用户可见异常默认英文，正式 OpenSpec 文档双语成对提交。
- 对 Phase 1/2 已建立的术语表和 UI i18n 约束做一致性收口。

## 能力

### 新能力
- `user-facing-error-english`：定义用户可见异常和错误提示统一使用英文默认消息的规则，以及已有错误码链路的复用方式。
- `openspec-bilingual-docs`：定义正式 OpenSpec 文档的英文主文件、中文镜像文件、互链和 archive 排除规则。
- `repository-maintenance-templates`：定义 `.github` 模板和贡献规范中关于文案、异常、OpenSpec 双语文档的维护约束。

### 修改能力
- `<none>`：Phase 3 以治理型能力为主，不直接修改现有业务能力规格。

## 影响

- 影响 `packages/ui`、`packages/core`、`packages/node`、`apps/server`、`apps/web`、`apps/extension`、`apps/desktop` 中会透到 UI 的错误文案。
- 影响 `openspec/specs/**` 与当前活跃 `openspec/changes/**` 的文档组织方式，但排除 `openspec/changes/archive/**`。
- 影响 `.github` 模板和 `CONTRIBUTING.md` 的维护规则。
- 不影响 UI 静态文案 i18n 基础设施，不引入异常多语言运行时。
