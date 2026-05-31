English | [Chinese](spec.zh-CN.md)

## ADDED Requirements

### Requirement: Core interfaces MUST extend IContextProvider with document ID resolution methods
`IContextProvider` MUST expose two new methods: `resolveDocumentIds` for batch ID-to-node resolution and `getDocumentId` for path-to-ID lookup. These methods MUST be part of the base interface so all provider implementations (FileSystem, HTTP, mock) are required to implement them.

#### Scenario: Batch-resolve document IDs to context nodes
- **WHEN** a caller invokes `resolveDocumentIds(ids: string[])` on a context provider
- **THEN** the provider MUST return a `Map<string, ContextNode | null>` covering every requested ID
- **AND** IDs that map to existing documents MUST resolve to their current `ContextNode`
- **AND** IDs for deleted or unknown documents MUST map to `null`

#### Scenario: Resolve a document path to its stable ID
- **WHEN** a caller invokes `getDocumentId(path: string)` on a context provider
- **AND** the document at that path has a `jarvis_id` in its frontmatter
- **THEN** the provider MUST return that `jarvis_id` string
- **AND** if the document has no ID yet, the provider MUST assign one and return it

---

### Requirement: Core interfaces MUST add documentIds to Conversation and Task models
The `Conversation` type MUST add a `documentIds?: string[]` field as the stable-ID counterpart to the existing `documentPaths`. The `Task` type MUST add a `documentId?: string | null` field alongside the existing `documentPath`. Both legacy path fields MUST be retained as deprecated for backward compatibility during the migration window.

#### Scenario: Conversation stores document associations by stable ID
- **WHEN** a conversation is linked to one or more documents
- **THEN** the `Conversation` object MUST carry the association in `documentIds`
- **AND** each entry in `documentIds` MUST be a valid `jarvis_id` of a `.md` document

#### Scenario: Task stores document association by stable ID
- **WHEN** a task is created or updated with a document association
- **THEN** the `Task` object MUST carry the association in `documentId`
- **AND** `documentId` MUST be the `jarvis_id` of the associated `.md` document, or `null` for project-level tasks

#### Scenario: Deprecated path fields remain readable during migration
- **WHEN** a conversation or task record was created before the ID migration
- **AND** only `documentPaths` / `documentPath` is populated
- **THEN** the system MUST continue to read and display the path-based association
- **AND** the system MUST migrate the record to `documentIds` / `documentId` on first access
