# openspec-bilingual-docs Specification

## Purpose
TBD - created by archiving change i18n-3. Update Purpose after archive.
## Requirements
### Requirement: Formal OpenSpec specs SHALL have Chinese mirror files
正式 `openspec/specs/**` 文档 SHALL 保留英文主文件 `spec.md`，并为每个正式 spec 提供同目录中文镜像 `spec.zh-CN.md`。

#### Scenario: Formal spec has a Chinese mirror
- **WHEN** 仓库存在 `openspec/specs/<capability>/spec.md`
- **THEN** 同目录 MUST 存在 `spec.zh-CN.md`
- **AND** 两个文件 MUST 表达相同能力要求

### Requirement: Active OpenSpec changes SHALL use paired bilingual artifact files
活跃 `openspec/changes/<name>/**` 文档 SHALL 使用英文主文件与中文镜像文件成对组织，适用于 `proposal`、`design`、`tasks` 和 change-local specs。

#### Scenario: Active change proposal has a Chinese mirror
- **WHEN** 活跃 change 包含 `proposal.md`
- **THEN** 同目录 MUST 提供 `proposal.zh-CN.md`

#### Scenario: Active change specs have Chinese mirrors
- **WHEN** 活跃 change 包含 `specs/<capability>/spec.md`
- **THEN** 同目录 MUST 提供 `spec.zh-CN.md`

### Requirement: Bilingual OpenSpec files SHALL provide reciprocal links
OpenSpec 英文主文件与中文镜像文件 SHALL 在文件顶部提供 `English | 中文` 双向互链，以便读者在语言版本之间切换。

#### Scenario: Reader opens an English OpenSpec document
- **WHEN** 读者打开英文主文件
- **THEN** 文件顶部 MUST 提供到中文镜像文件的链接

#### Scenario: Reader opens a Chinese OpenSpec mirror
- **WHEN** 读者打开中文镜像文件
- **THEN** 文件顶部 MUST 提供返回英文主文件的链接

### Requirement: Archived OpenSpec changes SHALL be excluded
`openspec/changes/archive/**` SHALL 不纳入 Phase 3 的翻译与双语镜像要求，避免改写历史归档内容。

#### Scenario: Archived change lacks Chinese mirror
- **WHEN** archive 中的旧 change 没有 `.zh-CN.md` 镜像
- **THEN** Phase 3 MUST NOT 要求为该归档 change 补齐镜像文件

### Requirement: Bilingual OpenSpec terminology SHALL follow the repository glossary
OpenSpec 中文镜像文件 SHALL 遵循仓库级术语表，核心术语的中英文对应 MUST 与 Phase 1 建立的术语基线一致。

#### Scenario: Chinese spec uses core terminology
- **WHEN** 中文镜像描述 Agent、Workspace、Provider、Context 或 Sync 等核心概念
- **THEN** 对应术语 MUST 与仓库级术语表保持一致

