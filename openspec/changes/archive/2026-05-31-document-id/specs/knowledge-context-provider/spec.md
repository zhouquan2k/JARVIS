English | [Chinese](spec.zh-CN.md)

## ADDED Requirements

### Requirement: Knowledge context provider MUST guard against cross-agent moves
`IContextProvider.moveNode` MUST reject any move operation where the source document's agent differs from the target parent's agent. The agent of a node is defined as the nearest ancestor directory that carries an `agentKey` in the current `WorkspaceContext`. This guard MUST be enforced in the provider layer, not only in the UI.

#### Scenario: Allow intra-agent move
- **WHEN** the user moves a document to a different directory within the same agent
- **AND** both the source and target parent share the same `agentKey`
- **THEN** the provider MUST complete the move and update the `DocumentIdentityIndex`
- **AND** the document's `jarvis_id` in frontmatter MUST remain unchanged

#### Scenario: Reject cross-agent move
- **WHEN** the user attempts to move a document to a directory belonging to a different agent
- **AND** the source `agentKey` differs from the target parent's `agentKey`
- **THEN** the provider MUST throw an error with a clear message indicating cross-agent moves are not supported
- **AND** the document MUST remain at its original location

#### Scenario: Allow intra-agent directory rename
- **WHEN** the user renames a directory within its agent
- **THEN** the provider MUST complete the rename
- **AND** MUST update the `DocumentIdentityIndex` for all `.md` documents under the renamed directory

---

### Requirement: Knowledge context provider MUST update DocumentIdentityIndex on rename and move
As part of every successful `renameNode` and `moveNode` operation, the provider MUST call `DocumentIdentityIndex.remap(fromPath, toPath)` before returning the result. The index update MUST be synchronous with the filesystem operation — no eventual consistency.

#### Scenario: Index updated atomically with filesystem rename
- **WHEN** `renameNode` completes a filesystem rename successfully
- **THEN** the provider MUST update the `DocumentIdentityIndex` for the renamed node (and all descendants if a directory) before returning
- **AND** any concurrent `resolveDocumentIds` call after the rename MUST return the new path

#### Scenario: Index not updated on failed rename
- **WHEN** `renameNode` fails at the filesystem level
- **THEN** the provider MUST NOT update the `DocumentIdentityIndex`
- **AND** subsequent ID resolution MUST still return the original path
