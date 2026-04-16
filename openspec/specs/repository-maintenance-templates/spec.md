# repository-maintenance-templates Specification

## Purpose
TBD - created by archiving change i18n-3. Update Purpose after archive.
## Requirements
### Requirement: Repository SHALL provide English-first GitHub templates
The repository SHALL provide English-first `.github` issue and PR templates to guide contributors in checking UI copy, error copy, and OpenSpec bilingual document requirements.

#### Scenario: Contributor opens a pull request
- **WHEN** a contributor opens a pull request
- **THEN** the PR template MUST include checks for UI i18n, English default error messages, and OpenSpec bilingual files

### Requirement: CONTRIBUTING SHALL document copy and OpenSpec maintenance rules
`CONTRIBUTING.md` SHALL clearly document the maintenance rules going forward: newly added static user-visible UI copy must go into UI i18n, user-visible errors must use English default messages, and formal OpenSpec documents must be submitted as English/Chinese pairs.

#### Scenario: Contributor adds static UI copy
- **WHEN** a contributor adds static user-visible UI copy
- **THEN** `CONTRIBUTING.md` MUST require that copy to be added to UI i18n resources

#### Scenario: Contributor adds user-visible error copy
- **WHEN** a contributor adds a user-visible error or error prompt
- **THEN** `CONTRIBUTING.md` MUST require English default messages rather than adding multilingual error entries

#### Scenario: Contributor adds formal OpenSpec docs
- **WHEN** a contributor adds a formal OpenSpec spec or an active change artifact
- **THEN** `CONTRIBUTING.md` MUST require submitting both the English primary file and the Chinese mirror file

### Requirement: Chinese contributing mirror SHALL match the English rules
`CONTRIBUTING.zh-CN.md` SHALL remain semantically aligned with the English contribution rules so Chinese maintainers see the same copy, error, and OpenSpec bilingual requirements.

#### Scenario: Chinese contributor reads contributing guide
- **WHEN** a Chinese contributor reads `CONTRIBUTING.zh-CN.md`
- **THEN** the document MUST contain maintenance rules equivalent to `CONTRIBUTING.md`
