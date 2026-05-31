[English](ARCHITECTURE.md) | [中文](ARCHITECTURE.zh-CN.md)

# Architecture

`docs/workspace.dsl` is the primary public architecture source for this repository. This document explains the system context and container views defined there and should be updated together with the DSL.

## System Context

ChatPrism sits between end users, external AI providers, and the user's knowledge repository.

### Primary actor

- Power AI users who compare model outputs, recover conversation history, and curate knowledge assets.

### External systems

- ChatGPT Web for login-backed model access and conversation history.
- Google Gemini API for model execution and model catalog queries.
- Gemini Web for browser-driven history extraction.
- A local or hosted knowledge repository for documents, imported files, and scoped workspace context.

## Container View

### Browser Extension App

- Hosts chat, comparison, history import, and knowledge workspace flows inside the browser.
- Uses browser capabilities such as cookies, content scripts, and extension storage.

### Web App

- Provides the main browser-based workspace for chat, comparison, and document-centric work.
- Relies on the sync server for shared context and provider configuration.

### Desktop App

- Extends the shared UI with desktop-only file and controlled-page capabilities.
- Reuses shared packages while adding Electron-hosted bridge logic.

### Sync Server

- Exposes conversation sync APIs, context APIs, and provider configuration endpoints.
- Connects shared contracts to filesystem- or database-backed persistence.

### Shared Packages

- `packages/core`: domain models, runtime abstractions, provider contracts, and workflow orchestration.
- `packages/ui`: reusable UI components, views, and state used by Web, Extension, and Desktop renderers.
- `packages/node`: Node-only adapters and infrastructure reused by Desktop main and the sync server.

## Responsibility Boundaries

- Host apps assemble capabilities for their runtime, but they do not redefine shared contracts.
- Shared packages hold the reusable conversation, provider, and context abstractions.
- The sync server is the public backend boundary for remote context and synchronization.
- The knowledge repository remains an external dependency even when it is mounted locally.

## Markdown Document Editing Strategy

The markdown viewer (Milkdown / ProseMirror) edits a structured document tree,
while the canonical document state remains the raw markdown string on disk.
Any attempt to map "viewer caret → source string offset" is fundamentally
fragile—Milkdown is a WYSIWYG editor and does not maintain a source map
between its document tree and the original byte stream.

### Decision

Viewer-mode insertions (link, conversation reference, resource embed triggered
from the document toolbar) dispatch a native ProseMirror transaction via
Milkdown's parser, and the new markdown source is re-emitted by Milkdown's
serializer. No viewer-to-source coordinate translation is attempted.

### Consequences

- Insert position is precise in every block kind, including empty paragraphs
  and positions adjacent to raw HTML.
- The first insertion after opening a document may normalize formatting
  (emphasis style, list markers, blank-line collapsing), producing a larger
  initial git diff. Subsequent edits are stable because the serializer output
  is deterministic.
- Edit mode (raw textarea) still splices the source string directly,
  preserving exact bytes when byte-level fidelity is required.
- This is a `packages/ui` internal decision; it does not affect the sync
  server contracts or cross-host interfaces.

The viewer-mode insertion entry point is `insertMarkdownAtViewerSelection`
in `packages/ui/src/utils/markdownDocument.ts`.

## Document Identity and Node Move Strategy

### Overview

Every markdown document carries a stable ULID written into its YAML frontmatter
under the key `jarvis_id`. This ID is the canonical, immutable identifier for a
document regardless of its path in the repository.

### Identity Assignment

- On first open, `DocumentIdentityIndex` checks whether `jarvis_id` is present
  in the frontmatter. If absent it is generated and written back.
- The index is in-memory only (`path → id` and `id → path` maps). There is no
  separate persistent index file; the source of truth is always the frontmatter.
- Frontmatter is stripped from the Milkdown editor representation via a WeakMap
  keyed on the document instance and restored on serialisation. The user never
  sees or edits `jarvis_id` directly.

### Move / Rename Strategy (Zero-cost)

When a node is moved or renamed:

1. Only the in-memory `DocumentIdentityIndex` is remapped (`identityIndex.remap(oldPath, newPath)`).
2. No database writes, no path-column rewrites. Conversations and tasks retain their original `documentIds[]` entries, which continue to match the frontmatter ULID regardless of where the file now lives.
3. The cross-agent guard inside `moveNode` ensures that the rename is refused if another agent process holds a lock on the file, preventing identity divergence under concurrent access.

### Query Routing

All context lookups are **`documentId`-first**:

- Server-side: `_getConversationsByDocumentId` / `_getTasksByDocumentId` are preferred when a `documentId` is supplied; `documentPath` is used only as a deprecated fallback for legacy records that predate the ULID scheme.
- Client-side: `documentScopedConversations` in `AgentConversationPanel` accepts a conversation if `documentPaths` includes the active path **or** `documentIds` includes the active document's ULID. This dual-match guard handles the window between a move and the next async data reload, ensuring conversations continue to appear immediately after a rename.

### Outgoing Link Rewrite

Links written into a document by the toolbar (conversation reference, resource embed) use standard relative paths anchored to the repository root. The `references/` directory is protected and its contents are never moved by link rewrite operations.

### Migration

Existing documents without `jarvis_id` are migrated in a single pass triggered the first time a `contextProvider` or workspace context is set. The migration sets `jarvis_schema: 1` in frontmatter as a completion flag and is idempotent—two flags `_conversationIdsMigrated` / `_taskIdsMigrated` track whether relationship records have been back-filled with the new ULID.

### Consistency with OpenSpec Design Decisions

| OpenSpec Decision | Status |
|---|---|
| Decision 1: ID in frontmatter, not a separate persistent index | ✓ Implemented |
| Decision 2: Cross-agent guard on move | ✓ Implemented |
| Decision 3: Single-pass migration, no double-write | ✓ Implemented |
| Decision 4: Standard relative paths for outgoing links, not `@/` syntax | ✓ Implemented |

Two implementation details that emerged during development and are not in the OpenSpec:
- WeakMap-based frontmatter isolation in Milkdown (keeps `jarvis_id` invisible to the editor).
- Dual-match filter (`documentPaths` OR `documentIds`) in `documentScopedConversations` to cover the async reload race condition after a move.

## External Dependency Flow

- The Web, Extension, and Desktop hosts call external model providers through shared runtime contracts.
- Extension and Desktop hosts also bridge browser-controlled history access for ChatGPT and Gemini.
- The sync server and desktop host can both access the knowledge repository through filesystem-aware adapters.

## Related Documents

- Repository overview: [README.md](README.md)
- C4 DSL source: [docs/workspace.dsl](docs/workspace.dsl)
- Documentation scope: [docs/overall.md](docs/overall.md)
- Context provider details: [docs/context-provider.md](docs/context-provider.md)
