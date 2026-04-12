## ADDED Requirements

### Requirement: workspace.dsl SHALL be the primary architecture source for public documentation
公开架构入口 MUST 以 `docs/workspace.dsl` 作为唯一主设计源，仓库对外描述架构时 SHALL 以该文件生成或引用的架构内容为基础，而不是单独维护脱节的说明文本。

#### Scenario: Public architecture entry references workspace.dsl
- **WHEN** 维护者编写或更新公开架构入口文档
- **THEN** 架构说明 MUST 明确以 `docs/workspace.dsl` 为主设计源

### Requirement: The primary public workspace DSL SHALL be English
`docs/workspace.dsl` SHALL 使用英文作为主版本，供外部读者理解系统上下文与容器边界；中文版本 MUST 作为镜像独立存在，而不是与英文混排在同一主文件中。

#### Scenario: English workspace DSL is used as the public primary file
- **WHEN** 外部读者查看公开架构 DSL
- **THEN** `docs/workspace.dsl` MUST 为英文主版本

#### Scenario: Chinese workspace DSL remains available as a mirror
- **WHEN** 中文读者需要查看架构 DSL
- **THEN** 仓库 MUST 提供 `docs/zh/workspace.zh-CN.dsl` 作为中文镜像

### Requirement: ARCHITECTURE.md SHALL be derived from context and container views
`ARCHITECTURE.md` SHALL 基于 `workspace.dsl` 的 context 图和 container 图来组织内容，至少覆盖系统上下文、主要容器、职责边界和外部依赖关系；该文档 MUST NOT 脱离这两个视图单独定义另一套公开架构结构。

#### Scenario: Architecture entry covers context and container structure
- **WHEN** 读者打开 `ARCHITECTURE.md`
- **THEN** 文档 MUST 基于 context 图和 container 图解释系统上下文与容器职责

#### Scenario: Architecture entry does not invent a parallel structure
- **WHEN** 维护者更新 `ARCHITECTURE.md`
- **THEN** 文档内容 MUST 与 `workspace.dsl` 中的 context/container 结构保持一致

### Requirement: Public architecture docs SHALL provide bilingual navigation
公开架构文档 SHALL 提供英文主入口与中文镜像之间的双向导航，确保英文读者和中文读者都能在不改变主路径约定的前提下访问对应内容。

#### Scenario: English architecture entry links to Chinese mirror
- **WHEN** 读者阅读 `ARCHITECTURE.md`
- **THEN** 文档 MUST 提供到 `ARCHITECTURE.zh-CN.md` 的显式链接

#### Scenario: Chinese architecture mirror links back to English entry
- **WHEN** 读者阅读 `ARCHITECTURE.zh-CN.md`
- **THEN** 文档 MUST 提供返回 `ARCHITECTURE.md` 的显式链接

### Requirement: Architecture artifacts SHALL be updated together
当 `docs/workspace.dsl` 被英文化或结构调整时，相关公开架构入口文档和镜像文档 MUST 同步更新，以避免 DSL、架构说明与镜像内容漂移。

#### Scenario: DSL and architecture entry are updated in the same change
- **WHEN** 变更修改 `docs/workspace.dsl` 的公开表达
- **THEN** 同一变更 MUST 同步更新 `ARCHITECTURE.md` 及必要的中文镜像文件

