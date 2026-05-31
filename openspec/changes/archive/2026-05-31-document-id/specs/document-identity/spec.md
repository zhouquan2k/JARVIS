English | [Chinese](spec.zh-CN.md)

## ADDED Requirements

### Requirement: Document identity system MUST assign a stable unique ID to each Markdown document via frontmatter
The system MUST assign an immutable `jarvis_id` stored in YAML frontmatter to every `.md` document in the workspace. The ID MUST be a ULID string, prefixed with `jarvis_id` to avoid collisions with other tools. The ID MUST be assigned on first association (when a conversation or task is first linked to the document). Non-markdown files and directories MUST NOT receive frontmatter IDs.

#### Scenario: Assign ID on first association
- **WHEN** a conversation or task is linked to a `.md` document for the first time
- **AND** the document's frontmatter does not yet contain a `jarvis_id` field
- **THEN** the system MUST generate a new ULID and write it as `jarvis_id` in the document's YAML frontmatter
- **AND** the document's body content MUST remain unchanged

#### Scenario: Preserve existing ID on subsequent associations
- **WHEN** a conversation or task is linked to a `.md` document
- **AND** the document's frontmatter already contains a valid `jarvis_id`
- **THEN** the system MUST use the existing `jarvis_id` without modifying the file

#### Scenario: Preserve user-authored frontmatter during ID write
- **WHEN** the system writes a `jarvis_id` to a document that already has other frontmatter fields
- **THEN** all existing frontmatter fields MUST be preserved with their original values
- **AND** the `jarvis_id` field MUST be appended without altering field order, comments, or formatting of existing fields

#### Scenario: Non-markdown files do not receive IDs
- **WHEN** a user attempts to link a non-markdown file (e.g., `.pdf`, `.png`) to a conversation or task
- **THEN** the system MUST NOT attempt to write a `jarvis_id` to that file
- **AND** the system MUST handle this case gracefully (e.g., reject the link or store only a path reference)

---

### Requirement: DocumentIdentityIndex MUST be built from frontmatter at workspace initialization
The system MUST scan all `.md` files in the workspace at initialization and build an in-memory `DocumentIdentityIndex` mapping `jarvis_id → current virtual path`. This index MUST be used for all ID-to-path resolution and path-to-ID lookups. No persistent index file is required.

#### Scenario: Build index on workspace initialization
- **WHEN** the workspace context provider initializes access
- **THEN** the system MUST scan all `.md` files in the workspace
- **AND** for each file containing a `jarvis_id` frontmatter field, MUST add an entry `id → path` to the index
- **AND** the index MUST be available for lookups before any document is opened

#### Scenario: Resolve ID to current path
- **WHEN** the system is asked to resolve a `jarvis_id` to a document path
- **AND** the ID exists in the index
- **THEN** the system MUST return the current virtual path of that document
- **AND** the resolution MUST complete without any filesystem access

#### Scenario: Return null for unknown IDs
- **WHEN** the system is asked to resolve a `jarvis_id` that is not present in the index
- **THEN** the system MUST return `null` (treating the document as deleted or not yet indexed)

#### Scenario: Batch-resolve multiple IDs efficiently
- **WHEN** the system is asked to resolve multiple `jarvis_id` values in one call
- **THEN** the system MUST return a map of `id → ContextNode | null` for all requested IDs
- **AND** MUST NOT perform a separate filesystem scan per ID

---

### Requirement: DocumentIdentityIndex MUST update in-place when a document is renamed or moved within its agent
The system MUST update the `DocumentIdentityIndex` as part of any `renameNode` or `moveNode` operation. The ID stored in frontmatter MUST remain unchanged. No relational data (conversations, tasks) needs to be rewritten when a document moves within its agent.

#### Scenario: Index updated after rename
- **WHEN** the user renames a `.md` document within its agent
- **THEN** the system MUST update the index entry for that document's `jarvis_id` to reflect the new path
- **AND** the `jarvis_id` in the document's frontmatter MUST NOT be changed
- **AND** any conversation or task linked via that `jarvis_id` MUST continue to resolve to the correct (new) document path

#### Scenario: Index updated after intra-agent move
- **WHEN** the user moves a `.md` document to a different directory within the same agent
- **THEN** the system MUST update the index entry to the new virtual path
- **AND** linked conversations and tasks MUST continue to resolve correctly

#### Scenario: Index updated for all documents in a renamed directory
- **WHEN** the user renames a directory that contains multiple `.md` documents
- **THEN** the system MUST update the index entries for all affected documents to their new paths
- **AND** all linked conversations and tasks MUST resolve correctly after the directory rename

---

### Requirement: DocumentIdentityIndex MUST detect and resolve duplicate IDs
The system MUST detect when two `.md` files contain the same `jarvis_id` (e.g., after an external `cp` operation) and resolve the conflict at initialization by re-assigning a new ULID to the file with the later modification time.

#### Scenario: Detect duplicate IDs at initialization
- **WHEN** the workspace initializes and two or more `.md` files contain the same `jarvis_id`
- **THEN** the system MUST detect the conflict
- **AND** MUST log a warning identifying the conflicting files

#### Scenario: Resolve duplicate by re-assigning to the newer file
- **WHEN** a duplicate `jarvis_id` is detected
- **THEN** the system MUST assign a new ULID to the file with the later `mtime`
- **AND** MUST write the new `jarvis_id` to that file's frontmatter
- **AND** the original file MUST retain its original `jarvis_id`
