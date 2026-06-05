[English](ARCHITECTURE.md) | [中文](ARCHITECTURE.zh-CN.md)

# Architecture Overview

This document describes the overall structure of JARVIS: deployable hosts, code layering and dependency boundaries, the plugin system, and several key design decisions. Multiple runtime forms (browser extension, web, desktop) share the core workspace UI and plugin system contracts, but differ in environment access and capability exposure.

## 1. Deployable Units / Hosts

Independently runnable and deployable units; they are runtime shells that expose their infrastructure capabilities to the application, and own no business logic.

- **Browser Extension App**

- **Web App**

- **Desktop App**

- **Sync Server**: Exposes session sync APIs, context APIs, and provider configuration interfaces. Bridges shared contracts to filesystem- or database-backed persistence implementations; it is the backend boundary for remote context and data sync.

## 2. Code Organization and Layering Boundaries

The table below lists modules, responsibilities, and dependency directions for each layer. The principle is: environment access belongs to hosts; the core workspace frontend (node tree + markdown documents) belongs to `packages/ui`; other domain capabilities belong to plugins; globally shared contracts belong to `packages/core`.

| Module | Responsibility | Dependencies |
|---|---|---|
| `apps/*` (hosts)<br/>(web / desktop / extension) | Runtime shell and composition root: lifecycle, bridges, storage, filesystem, browser capabilities, and other environment access; hands control to `ui` at the entry point; not responsible for plugin enablement or assembly | → `ui` / `core` (no direct dependency on `plugins` / `plugin-system`) |
| `apps/server` | Session and context sync backend: exposes session sync APIs, context query/write interfaces; adapts filesystem persistence; is the sync boundary between remote UI and local data | → `core` / `node`; compile-time dependency on `@plugins/ai-agent` (pending migration to a generic CRUD API) |
| `packages/ui` | Core frontend layer of the Markdown document workspace: workspace shell, layout containers, document tree interaction, document open/edit/save, shared display components, extension point rendering; responsible for loading the plugin system | → `plugin-system` / `core`; may consume environment facts and context exposed by hosts; does not carry AI/task-specific workflows, stores, or business rules |
| `packages/plugin-system` | Plugin system: plugin registration, enablement, assembly, runtime context construction, and plugin runtime orchestration | → `core`; ideally no compile-time dependency on `plugins` — loads plugins dynamically at runtime per the plugin contracts defined in `core` |
| `packages/core` | Minimal stable cross-package contracts, plugin contracts, and host-agnostic general infrastructure | No dependency on any upper layer; AI/task domain contracts should not accumulate here |
| `packages/node` | Node-only adapter layer and infrastructure implementations shared between the Desktop main process and the sync server | → `core` |
| `plugins/*` | Domain capabilities such as AI and tasks: domain models, workflows, stores, business views, capability-specific rules | → `core` (implements its plugin contracts); ideally exposes no `api` and is not a compile-time dependency of any package |

The dependency chain is `apps → ui → plugin-system ⇢ plugins`: the host hands control to `ui` at the entry point; `ui` loads `plugin-system`; `plugin-system` dynamically loads, registers, and assembles `plugins` at runtime per plugin contracts (`⇢` denotes runtime loading, not a compile-time dependency). Hosts are thereby decoupled from concrete plugins and depend only on `ui` and `core`.

**General Dependency Principles:**

- When environment differences affect upper-layer behavior, hosts should expose them as **environment properties, capability handles, or context** to be consumed in place by upper layers, rather than writing business branches directly inside the host.
- For runtime concepts, bootstrap result objects, or UI shell objects that are easy to blur, default to "**don't design for the future; refactor when needed; otherwise keep it simple (fewer classes is better)**"; introduce a new independent type or shell only when current responsibilities are already clearly distinct.
- Hosts do not directly depend on `plugins` / `plugin-system`, and are not responsible for plugin enablement or assembly; plugin registration and assembly are the responsibility of `plugin-system`.
- Interactions between plugins, and between `plugin-system` and concrete plugins, are all conducted through plugin contracts defined in `core`; ideally plugins need not expose an `api` and should not be a compile-time dependency of any package.
- `packages/core` has no dependency on any upper layer; domain contracts belonging to AI or task capabilities should not accumulate here.
- Business logic for AI, tasks, and future capabilities belongs in their respective plugins, and should not continue to accumulate in `packages/ui`.
- A knowledge base, even when deployed locally, is still treated as an external dependency (see Section 5).

## 3. Plugin System

### 3.1 Role of plugin-system

- `packages/plugin-system` is the implementation layer of the plugin system, responsible for plugin registration (`PluginRegistry`), enablement and assembly (`PluginManager`), runtime context construction, and plugin runtime orchestration.
- It is loaded by `packages/ui` during workspace initialization; hosts do not depend on it directly and do not participate in plugin enablement or assembly.
- It only has a compile-time dependency on `packages/core`; ideally it does not compile-time depend on concrete `plugins`, instead loading them dynamically at runtime per the plugin contracts defined in `core`, making it the decoupling layer between the "core workspace frontend" and "concrete domain plugins."

### 3.2 Plugin Role and Boundaries

- `plugins/*` own domain models, workflows, stores, business views, and capability-specific rules.
- AI, tasks, and future capabilities are all carried as plugins; their business state machines and workflow orchestration should not leak into hosts or `packages/ui`.

### 3.3 Plugin Contracts and Isolation

- Plugins integrate into the system by implementing plugin contracts defined in `core`, and are discovered and loaded by `plugin-system` at runtime.
- Ideally plugins **need not expose an `api`** — no other module should need to consume a plugin directly; all interactions are conducted via contracts and runtime context.
- Plugin internal implementations stay entirely within the plugin directory, are not compile-time dependencies of any package, and no one should depend on their internal implementation paths.

### 3.4 Plugin Collaboration with Hosts / UI

- Plugins may consume environment facts exposed by hosts (via the runtime context built by `plugin-system`) and decide capability-related behavior accordingly.
- The extension point rendering layer is consumed by `packages/ui`; plugins inject business views into the core workspace through extension points.

### 3.5 Enablement and Assembly

- Plugin enablement and assembly are the responsibility of `plugin-system`, occurring during the phase when `ui` loads the plugin system, not at the host composition root.
- Hosts only hand control to `ui` at the entry point and expose environment facts upward for `plugin-system` to build the runtime context; business decisions remain inside plugins.

## 4. Key Design Decisions (ADRs)

### 4.1 Markdown Document Editing Strategy

The markdown viewer (Milkdown / ProseMirror) edits a structured document tree, while the source of truth for the document is still the raw markdown string on disk. Any mapping from "viewer cursor → source character offset" is fundamentally unstable — Milkdown is a WYSIWYG editor and does not maintain a source map between the document tree and the raw byte stream.

**Decision**

Insert operations in viewer mode (links / conversation references / asset embeds triggered from the document toolbar) are parsed into nodes via Milkdown's parser and dispatched as native ProseMirror transactions; new markdown source is regenerated in full by Milkdown's serializer. No attempt is made to perform any "viewer → source" coordinate translation.

**Consequences**

- Insertion position is accurate on any block type, including empty paragraphs and positions adjacent to raw HTML.
- The first insertion after opening a document may normalize formatting (emphasis marker style, list bullet style, consecutive blank line merging, etc.), producing a large initial git diff. Subsequent edits are stable because serializer output is deterministic.
- Edit mode (plain textarea) continues to splice directly on the source string, preserving this path when byte-level truth is needed.
- This is an internal decision of `packages/ui` and does not affect sync service contracts or cross-host interfaces.

The viewer-mode insertion entry point is `insertMarkdownAtViewerSelection` in `packages/ui/src/utils/markdownDocument.ts`.

### 4.2 Document Identity and Node Movement

**Overview**

Each markdown document has a stable ULID written into its YAML frontmatter under the key `jarvis_id`. Regardless of how the file path changes, this ID is always the document's immutable canonical identifier.

**Identity Assignment**

- On first open, `DocumentIdentityIndex` checks whether `jarvis_id` exists in the frontmatter; if not, one is generated and written back.
- The index is kept in memory only (`path → id` and `id → path` bidirectional mappings). There is no separate persistent index file; the source frontmatter is the source of truth.
- The Milkdown editor strips the frontmatter at the presentation layer using a WeakMap keyed by document instance, and restores it during serialization. Users never see or directly edit `jarvis_id`.

**Move / Rename Strategy (Zero-Cost)**

When a node is moved or renamed:

1. Only the in-memory `DocumentIdentityIndex` is updated (`identityIndex.remap(oldPath, newPath)`).
2. No database writes; no path column changes. Existing `documentIds[]` entries in session and task records remain unchanged and still match the ULID in the document frontmatter, independent of the file's current location.
3. A cross-agent guard inside `moveNode` ensures that a rename is rejected when another Agent process holds a file lock, preventing concurrent access from causing identity splits.

**Query Routing**

All context queries follow a **`documentId`-first** approach:

- Server-side: when `documentId` is present, prefer `_getConversationsByDocumentId` / `_getTasksByDocumentId`; `documentPath` is only a fallback for early records.
- Client-side: `documentScopedConversations` in `AgentConversationPanel` accepts conversations that satisfy either of the following: `documentPaths` contains the current path, **or** `documentIds` contains the current document's ULID. This dual-match guard covers the window between a move operation and the next async data reload, ensuring conversations are shown immediately after a rename.

**Outbound Link Rewriting**

Links written into documents by the toolbar (conversation references, asset embeds) use standard relative paths relative to the repository root. The `references/` directory is protected and its contents are not affected by link rewriting operations.

## 5. Runtime and External Dependency Chain

- Web, Extension, and Desktop call external model providers through shared runtime contracts.
- Extension and Desktop also bridge browser-controlled pages to access ChatGPT and Gemini history.
- Both the Sync Server and the Desktop host can access the knowledge base through a filesystem adapter layer; the knowledge base is treated as an external dependency even when deployed locally.
