English | [Chinese](proposal.zh-CN.md)

## Why

Currently, conversations and tasks reference documents by file path (`documentPaths`, `documentPath`). When a document is renamed or moved within an agent, all linked conversations and tasks silently lose their association. Introducing a stable document ID stored in Markdown frontmatter decouples identity from location, so rename and move operations within an agent become zero-cost for relational integrity.

## What Changes

- Each Markdown document (`.md`) gets a unique, immutable `id` field in its YAML frontmatter assigned on first access.
- `Conversation.documentPaths` and `Task.documentPath` are replaced by `documentIds` / `documentId` referencing these stable IDs.
- An in-memory `DocumentIdentityIndex` (`id → currentPath`) is built at workspace initialization by scanning frontmatter; all lookups go through this index.
- `IContextProvider.renameNode` and `moveNode` update the index in-place — no relational data needs rewriting.
- Document-internal references (images, links to other documents) switch from relative paths to **agent-absolute paths** (rooted at the nearest enclosing agent/project folder), so the referencing document can move freely within its agent without breaking those links.
- Cross-agent moves are **not supported** in this change; attempting one is a hard UI error.
- Scope: `.md` files only. Non-markdown files, directories, and binary assets are out of scope for stable IDs.

## Capabilities

### New Capabilities

- `document-identity`: Stable ID assignment, frontmatter read/write, in-memory index lifecycle, and `IContextProvider` extension for ID-based document resolution.

### Modified Capabilities

- `core-interfaces`: `IContextProvider` gains `resolveDocumentIds(ids)` and emits a `DocumentIdentityChanged` event; `Conversation` and `Task` models replace path fields with ID fields.
- `knowledge-workspace`: Rename/move operations are guarded against cross-agent boundaries; editor inserts agent-absolute paths for new image/document links instead of relative paths.
- `knowledge-context-provider`: `FileSystemContextProvider.renameNode` / `moveNode` update the `DocumentIdentityIndex` as part of the operation.

## Impact

- **packages/core**: `Conversation`, `Task` interfaces; `IContextProvider`
- **packages/node**: `FileSystemContextProvider`, `FileSystemTaskProvider`
- **packages/ui**: `documentWorkspace` store, `chat` store, link insertion logic in editor
- **apps/server**: `syncRepository` (conversation/task persistence), sync protocol
- **apps/desktop**: IPC bridge for new `resolveDocumentIds` call
- **Data migration**: existing `documentPaths` / `documentPath` values must be back-filled to IDs at workspace open; a one-way migration with rollback window is required.
