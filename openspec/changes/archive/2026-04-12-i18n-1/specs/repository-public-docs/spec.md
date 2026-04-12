## ADDED Requirements

### Requirement: Repository default public entry SHALL be English
仓库对外公开入口 SHALL 以英文为默认语言，外部读者在访问仓库首页时 MUST 首先看到英文 README，而中文内容 MUST 通过显式镜像入口访问，而不是作为默认首页内容。

#### Scenario: GitHub repository landing page uses English README
- **WHEN** 外部读者打开仓库首页
- **THEN** 仓库默认展示的 `README.md` MUST 为英文主文档

#### Scenario: Chinese mirror is reachable from the English entry
- **WHEN** 读者在英文 `README.md` 中查找其他语言入口
- **THEN** 文档 MUST 提供到 `README.zh-CN.md` 的显式链接

### Requirement: Public repository documents SHALL have paired English and Chinese entry points
仓库级公开文档 SHALL 为核心入口文档提供英文主版本与中文镜像，且中文镜像 MUST 使用显式文件名或镜像路径，避免与英文主文档混用同一路径。

#### Scenario: Root public documents provide paired language entries
- **WHEN** 仓库提供 `README`、`CONTRIBUTING`、`ARCHITECTURE` 等公开入口文档
- **THEN** 每份核心入口文档 MUST 具有英文主版本和可访问的中文镜像版本

#### Scenario: Chinese mirror is not used as the default public path
- **WHEN** 维护者新增或重构根级公开文档
- **THEN** 英文版本 MUST 保留主路径，中文版本 MUST 使用显式镜像文件名

### Requirement: Core public docs SHALL use a stable mirror convention
`docs/` 下纳入 Phase 1 的核心公开文档 SHALL 使用稳定的镜像规则：英文主文档保留在原始公开路径，中文镜像 MUST 放在 `docs/zh/`，并提供 `English | 中文` 双向互链。

#### Scenario: Core docs use docs/zh mirror path
- **WHEN** 核心公开文档被纳入 Phase 1
- **THEN** 英文文档 MUST 位于 `docs/` 原路径，中文镜像 MUST 位于 `docs/zh/` 对应路径

#### Scenario: Core docs expose reciprocal language navigation
- **WHEN** 读者打开任一纳入 Phase 1 的核心公开文档
- **THEN** 文档顶部 MUST 提供 `English | 中文` 双向互链

### Requirement: Historical docs SHALL remain out of scope for Phase 1
Phase 1 MUST NOT 扩展到 `docs/` 下历史性 phase 文档的全量迁移，除非该文档被明确列为本阶段的核心公开入口。

#### Scenario: Historical phase docs are not migrated by default
- **WHEN** 实施 Phase 1
- **THEN** `docs/` 下历史性 phase 文档 MUST 保持现状，除非被单独列入 Phase 1 范围

### Requirement: Repository glossary SHALL define canonical bilingual terminology
仓库 SHALL 提供一个公开可访问的术语表，用于定义 Phase 1 文档以及后续 Phase 2/3 所使用的核心中英文术语；公开文档 MUST 使用该术语表中的规范用词。

#### Scenario: Glossary is available to repository readers
- **WHEN** 读者查阅仓库公开文档时需要理解关键术语
- **THEN** 仓库 MUST 提供一个可访问的术语表文档，列出核心中英文术语对照

#### Scenario: Public docs follow glossary terminology
- **WHEN** 维护者编写或更新公开文档
- **THEN** 文档中的关键术语 MUST 与术语表中的中英文规范保持一致

### Requirement: Repository metadata SHALL support open-source discovery
仓库元数据 SHALL 补齐对外公开所需的基础字段，以支持开源展示、主页跳转和问题反馈入口。

#### Scenario: Package metadata exposes repository identity
- **WHEN** 维护者更新仓库公开入口
- **THEN** `package.json` MUST 补齐 `description`、`repository`、`homepage` 和 `bugs` 等对外字段

