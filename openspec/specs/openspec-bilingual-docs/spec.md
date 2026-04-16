# openspec-bilingual-docs Specification

## Purpose
TBD - created by archiving change i18n-3. Update Purpose after archive.
## Requirements
### Requirement: Formal OpenSpec specs SHALL have Chinese mirror files
Formal `openspec/specs/**` documents SHALL keep the English primary file `spec.md`, and each formal spec MUST have a Chinese mirror file `spec.zh-CN.md` in the same directory.

#### Scenario: Formal spec has a Chinese mirror
- **WHEN** the repository contains `openspec/specs/<capability>/spec.md`
- **THEN** `spec.zh-CN.md` MUST exist in the same directory
- **AND** the two files MUST express the same capability requirements

### Requirement: Active OpenSpec changes SHALL use paired bilingual artifact files
Active `openspec/changes/<name>/**` documents SHALL be organized as English primary files paired with Chinese mirror files, covering `proposal`, `design`, `tasks`, and change-local specs.

#### Scenario: Active change proposal has a Chinese mirror
- **WHEN** an active change includes `proposal.md`
- **THEN** the same directory MUST provide `proposal.zh-CN.md`

#### Scenario: Active change specs have Chinese mirrors
- **WHEN** an active change includes `specs/<capability>/spec.md`
- **THEN** the same directory MUST provide `spec.zh-CN.md`

### Requirement: Bilingual OpenSpec files SHALL provide reciprocal links
OpenSpec English primary files and Chinese mirror files SHALL provide `English | Chinese` bidirectional links at the top of the file so readers can switch between language versions.

#### Scenario: Reader opens an English OpenSpec document
- **WHEN** a reader opens the English primary file
- **THEN** the top of the file MUST provide a link to the Chinese mirror

#### Scenario: Reader opens a Chinese OpenSpec mirror
- **WHEN** a reader opens the Chinese mirror file
- **THEN** the top of the file MUST provide a link back to the English primary file

### Requirement: Archived OpenSpec changes SHALL be excluded
`openspec/changes/archive/**` SHALL not be included in Phase 3 translation and bilingual mirror requirements so historical archived content is not rewritten.

#### Scenario: Archived change lacks Chinese mirror
- **WHEN** an old change in the archive does not have a `.zh-CN.md` mirror
- **THEN** Phase 3 MUST NOT require adding a mirror file for that archived change

### Requirement: Bilingual OpenSpec terminology SHALL follow the repository glossary
OpenSpec Chinese mirror files SHALL follow the repository glossary, and the Chinese-English mappings for core terms MUST stay consistent with the terminology baseline established in Phase 1.

#### Scenario: Chinese spec uses core terminology
- **WHEN** a Chinese mirror describes core concepts such as Agent, Workspace, Provider, Context, or Sync
- **THEN** the corresponding terms MUST remain consistent with the repository glossary
