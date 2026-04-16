# architecture-entry-docs Specification

## Purpose
TBD - created by archiving change i18n-1. Update Purpose after archive.
## Requirements
### Requirement: `workspace.dsl` SHALL be the primary architecture source for public documentation
The public architecture entry MUST use `docs/workspace.dsl` as the single source of truth. When describing architecture externally, the repository SHALL rely on content generated from or referenced by that file rather than maintaining a separate, disconnected explanation.

#### Scenario: Public architecture entry references workspace.dsl
- **WHEN** a maintainer writes or updates the public architecture entry document
- **THEN** the architecture description MUST explicitly use `docs/workspace.dsl` as the primary design source

### Requirement: The primary public workspace DSL SHALL be English
`docs/workspace.dsl` SHALL use English as the primary version so external readers can understand the system context and container boundaries; the Chinese version MUST exist as a separate mirror rather than being mixed into the same main file.

#### Scenario: English workspace DSL is used as the public primary file
- **WHEN** an external reader views the public architecture DSL
- **THEN** `docs/workspace.dsl` MUST be the English primary version

#### Scenario: Chinese workspace DSL remains available as a mirror
- **WHEN** a Chinese reader needs to view the architecture DSL
- **THEN** the repository MUST provide `docs/zh/workspace.zh-CN.dsl` as the Chinese mirror

### Requirement: `ARCHITECTURE.md` SHALL be derived from context and container views
`ARCHITECTURE.md` SHALL organize its content around the context and container views in `workspace.dsl`, covering at least the system context, primary containers, responsibility boundaries, and external dependencies; the document MUST NOT define a separate public architecture structure detached from those two views.

#### Scenario: Architecture entry covers context and container structure
- **WHEN** a reader opens `ARCHITECTURE.md`
- **THEN** the document MUST explain system context and container responsibilities based on the context and container views

#### Scenario: Architecture entry does not invent a parallel structure
- **WHEN** a maintainer updates `ARCHITECTURE.md`
- **THEN** the document content MUST stay consistent with the context/container structure in `workspace.dsl`

### Requirement: Public architecture docs SHALL provide bilingual navigation
The public architecture documents SHALL provide bidirectional navigation between the English entry and the Chinese mirror, ensuring that both English and Chinese readers can reach the corresponding content without changing the primary path convention.

#### Scenario: English architecture entry links to Chinese mirror
- **WHEN** a reader reads `ARCHITECTURE.md`
- **THEN** the document MUST provide an explicit link to `ARCHITECTURE.zh-CN.md`

#### Scenario: Chinese architecture mirror links back to English entry
- **WHEN** a reader reads `ARCHITECTURE.zh-CN.md`
- **THEN** the document MUST provide an explicit link back to `ARCHITECTURE.md`

### Requirement: Architecture artifacts SHALL be updated together
When `docs/workspace.dsl` is anglicized or structurally adjusted, the related public architecture entry documents and mirror documents MUST be updated together to avoid drift between the DSL, the architecture description, and the mirror content.

#### Scenario: DSL and architecture entry are updated in the same change
- **WHEN** a change modifies the public expression of `docs/workspace.dsl`
- **THEN** the same change MUST update `ARCHITECTURE.md` and any necessary Chinese mirror files
