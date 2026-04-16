# repository-public-docs Specification

## Purpose
TBD - created by archiving change i18n-1. Update Purpose after archive.
## Requirements
### Requirement: Repository default public entry SHALL be English
The repository's public entry SHALL default to English. When external readers open the repository homepage, they MUST first see the English README, and Chinese content MUST be accessed through an explicit mirror entry rather than appearing as the default homepage content.

#### Scenario: GitHub repository landing page uses English README
- **WHEN** an external reader opens the repository homepage
- **THEN** the default `README.md` shown by the repository MUST be the English primary document

#### Scenario: Chinese mirror is reachable from the English entry
- **WHEN** a reader looks for another language entry in the English `README.md`
- **THEN** the document MUST provide an explicit link to `README.zh-CN.md`

### Requirement: Public repository documents SHALL have paired English and Chinese entry points
Repository-level public documents SHALL provide an English primary version and a Chinese mirror for each core entry document, and the Chinese mirror MUST use an explicit filename or mirror path rather than sharing the same path as the English primary document.

#### Scenario: Root public documents provide paired language entries
- **WHEN** the repository provides public entry documents such as `README`, `CONTRIBUTING`, and `ARCHITECTURE`
- **THEN** each core entry document MUST have an English primary version and an accessible Chinese mirror version

#### Scenario: Chinese mirror is not used as the default public path
- **WHEN** a maintainer adds or restructures a root-level public document
- **THEN** the English version MUST keep the primary path, and the Chinese version MUST use an explicit mirror filename

### Requirement: Core public docs SHALL use a stable mirror convention
Core public documents included under Phase 1 in `docs/` SHALL use a stable mirror convention: the English primary document stays at the original public path, the Chinese mirror MUST live under `docs/zh/`, and the documents MUST provide `English | Chinese` bidirectional links.

#### Scenario: Core docs use docs/zh mirror path
- **WHEN** a core public document is included in Phase 1
- **THEN** the English document MUST remain at its original `docs/` path and the Chinese mirror MUST be placed at the corresponding `docs/zh/` path

#### Scenario: Core docs expose reciprocal language navigation
- **WHEN** a reader opens any core public document included in Phase 1
- **THEN** the top of the document MUST provide `English | Chinese` bidirectional links

### Requirement: Historical docs SHALL remain out of scope for Phase 1
Phase 1 MUST NOT expand to a full migration of historical phase documents under `docs/` unless a document is explicitly listed as a core public entry for this phase.

#### Scenario: Historical phase docs are not migrated by default
- **WHEN** Phase 1 is implemented
- **THEN** historical phase documents under `docs/` MUST remain unchanged unless they are separately included in the Phase 1 scope

### Requirement: Repository glossary SHALL define canonical bilingual terminology
The repository SHALL provide a publicly accessible glossary to define the core Chinese and English terminology used in Phase 1 documents and the later Phase 2/3 work; public documents MUST use the canonical terms from that glossary.

#### Scenario: Glossary is available to repository readers
- **WHEN** a reader needs to understand key terms while reading the public repository docs
- **THEN** the repository MUST provide an accessible glossary document listing the core Chinese-English term mappings

#### Scenario: Public docs follow glossary terminology
- **WHEN** a maintainer writes or updates a public document
- **THEN** the key terms in the document MUST remain consistent with the glossary's canonical Chinese and English terminology

### Requirement: Repository metadata SHALL support open-source discovery
Repository metadata SHALL include the baseline fields needed for public exposure so it supports open-source presentation, homepage navigation, and issue reporting entry points.

#### Scenario: Package metadata exposes repository identity
- **WHEN** a maintainer updates the repository's public entry
- **THEN** `package.json` MUST include public-facing fields such as `description`, `repository`, `homepage`, and `bugs`
