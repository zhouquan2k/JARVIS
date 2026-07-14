[English](ARCHITECTURE.md) | [中文](ARCHITECTURE.zh-CN.md)

# Architecture Overview

This document describes the overall structure of JARVIS: deployable hosts, code layering and dependency boundaries, the plugin system, and several key design decisions. Multiple runtime forms (browser extension, web, desktop) share the core workspace UI and plugin system contracts, but differ in environment access and capability exposure.

## 1. Deployable Units / Hosts

Independently runnable and deployable units; they are runtime shells that expose their infrastructure capabilities to the application, and own no business logic.

- **Browser Extension App**

- **Web App**: browser / PWA host; in production it is served same-origin by the Sync Server, and offline behavior relies on a Service Worker app shell plus read-only document cache

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
| `plugins/*` | Domain capabilities such as AI and tasks: domain models, workflows, stores, business views, capability-specific rules | → `core` (implements its plugin contracts); during the transition they may reuse stable rendering-layer exports from `ui`, but should not depend on `ui/src/*` internals; ideally expose no `api` and are not a compile-time dependency of any package |

The dependency chain is `apps → ui → plugin-system ⇢ plugins`: the host hands control to `ui` at the entry point; `ui` loads `plugin-system`; `plugin-system` dynamically loads, registers, and assembles `plugins` at runtime per plugin contracts (`⇢` denotes runtime loading, not a compile-time dependency). Hosts are thereby decoupled from concrete plugins and depend only on `ui` and `core`.

**General Dependency Principles:**

- When environment differences affect upper-layer behavior, hosts should expose them as **environment properties, capability handles, or context** to be consumed in place by upper layers, rather than writing business branches directly inside the host.
- For runtime concepts, bootstrap result objects, or UI shell objects that are easy to blur, default to "**don't design for the future; refactor when needed; otherwise keep it simple (fewer classes is better)**"; introduce a new independent type or shell only when current responsibilities are already clearly distinct.
- Hosts do not directly depend on `plugins` / `plugin-system`, and are not responsible for plugin enablement or assembly; plugin registration and assembly are the responsibility of `plugin-system`.
- Interactions between plugins, and between `plugin-system` and concrete plugins, are all conducted through plugin contracts defined in `core`; during the transition plugins may reuse stable public exports from `ui` for rendering integration, but should not depend on `ui/src/*` internals; ideally plugins need not expose an `api` and should not be a compile-time dependency of any package.
- `packages/core` has no dependency on any upper layer; domain contracts belonging to AI or task capabilities should not accumulate here.
- Business logic for AI, tasks, and future capabilities belongs in their respective plugins, and should not continue to accumulate in `packages/ui`.
- A knowledge base, even when deployed locally, is still treated as an external dependency (see Section 5).

## 3. Plugin System

### 3.1 Role of plugin-system

- `packages/plugin-system` is the implementation layer of the plugin system, responsible for plugin registration, enablement and assembly, runtime context construction, and plugin runtime orchestration.
- It is loaded by `packages/ui` during workspace initialization; hosts do not depend on it directly and do not participate in plugin enablement or assembly.
- It only has a compile-time dependency on `packages/core`; ideally it does not compile-time depend on concrete `plugins`, instead loading them dynamically at runtime per the plugin contracts defined in `core`, making it the decoupling layer between the "core workspace frontend" and "concrete domain plugins."

### 3.2 Plugin Role and Boundaries

- `plugins/*` own domain models, workflows, stores, business views, and capability-specific rules.
- AI, tasks, and future capabilities are all carried as plugins; their business state machines and workflow orchestration should not leak into hosts or `packages/ui`.

### 3.3 Plugin Contracts and Isolation

- Plugins integrate into the system by implementing plugin contracts defined in `core`, and are discovered and loaded by `plugin-system` at runtime.
- Ideally plugins **need not expose an `api`** — no other module should need to consume a plugin directly; all interactions are conducted via contracts and runtime context. During the transition, if a plugin must reuse workspace rendering helpers, it should depend on stable exports from `@packages/ui` rather than `@packages/ui/src/*`.
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

### 4.2 Document Identity and Node Movement

**Overview**

Each markdown document has a stable ULID written into its YAML frontmatter under the key `jarvis_id`. Regardless of how the file path changes, this ID is always the document's immutable canonical identifier.

**Identity Assignment**

- On first open, the in-memory document identity index checks whether `jarvis_id` exists in the frontmatter; if not, one is generated and written back.
- The index is kept in memory only (`path → id` and `id → path` bidirectional mappings). There is no separate persistent index file; the source frontmatter is the source of truth.
- The Milkdown editor strips the frontmatter at the presentation layer using a WeakMap keyed by document instance, and restores it during serialization. Users never see or directly edit `jarvis_id`.

**Move / Rename Strategy (Zero-Cost)**

When a node is moved or renamed:

1. Only the in-memory document identity index is updated.
2. No database writes; no path column changes. Existing `documentIds[]` entries in session and task records remain unchanged and still match the ULID in the document frontmatter, independent of the file's current location.
3. The node-move path includes a cross-agent guard: when another Agent process holds the file lock, the rename is rejected to prevent identity splits under concurrent access.

**Query Routing**

All context queries follow a **`documentId`-first** approach:

- Server-side: when `documentId` is present, prefer stable document-identity lookup; `documentPath` is only a fallback for early records.
- Client-side: the current-document conversation list accepts either a path match or a stable document-identity match. This dual-match guard covers the window between a move operation and the next async data reload, ensuring conversations are shown immediately after a rename.

**Outbound Link Rewriting**

Links written into documents by the toolbar (conversation references, asset embeds) use standard relative paths relative to the repository root. The `references/` directory is protected and its contents are not affected by link rewriting operations.

### 4.3 Standalone Server + Relative-Path Renderer / Direct Hub Mode

**Overview**

`apps/server` is a standalone process and the sole backend for context / sync / provider-config / codex. Desktop does not embed its own HTTP server; the dependency direction is always **desktop → server**: the server is unaware of desktop at both compile and runtime, receiving only a generic static-root config (`CHATPRISM_RENDERER_DIST`) treated like nginx's `root`.

**Decision**

Desktop supports two runtime shapes:

- **server-origin / dev-server mode**: the renderer is **same-origin** with the API, and every `/api/*` call uses a **relative path**.
- **local-bundle mode**: the renderer is loaded from a local bundle, main injects absolute hub URLs into the renderer, the document workspace talks over IPC to a local file-context capability owned by the main process rather than treating remote `/api/context` as its primary path, and remote sync/codex traffic goes through the main-process bridge.

- **dev**: the renderer is served by a local dev server, which proxies `/api` and `/health` to the local backend.
- **server-origin / prod / e2e**: the renderer is served statically by the server, making renderer and API same-origin by construction; web2 PWA / offline E2E must run in this mode to exercise real Service Worker precache and runtime cache behavior.
- **local-bundle / desktop production-simulation**: main directly loads the local bundle and injects real hub URLs into the renderer through environment-backed configuration.
- When main does not inject explicit hub URLs, the renderer still falls back to relative defaults such as `/api/context`, `/api/sync`, `/api/codex`, and `/api/provider-configs`.
- Desktop's offline boundary is layered: document tree access, document read/write, node CRUD, and scoped search depend on the local file-context capability; `sync`, `codex`, and `provider-configs` remain online capabilities and are not claimed to work offline.
- Treat the resource / attachment layer separately from document text: markdown source files continue to persist relative references (for example `references/...`); the desktop viewer may resolve local assets into temporary local URLs at render time (for example `blob:`) to support offline access, but those runtime URLs are never written back into the document, so filesystem-oriented consumers such as Obsidian, external agents, git, and Dropbox still see the original relative links.

**Consequences**

- Eliminates renderer-side CORS in same-origin mode; in local-bundle mode the main-process fetch bridge bypasses renderer-side CORS entirely.
- `document-asset` is a compatible HTTP resource representation, but it is not the only long-term shape for desktop local asset access; desktop may resolve assets directly from the local file domain without requiring the resource layer to keep depending on remote or local-server `/api/context/document-asset`.
- CSP only needs `img-src 'self'` to allow local resources such as `document-asset` images — no special-case for `http://127.0.0.1:*`; when desktop uses `blob:` URLs at render time, those URLs are a viewer-only implementation detail and do not change the underlying file-domain source of truth.
- Relative paths are agnostic to deployment port / host, making migration and packaging more robust.
- The Web host's offline boundary is "static shell + read-only cache for recently viewed documents + IndexedDB replicas for conversations/tasks"; browser cache remains a projection layer, not the source of truth for documents.

### 4.4 Single-Hub Deployment: NAS Server, Dropbox File Sync, Database-Backed Record Sync

**Overview**

In the deployed topology there is exactly one running `apps/server` instance — a Docker container on a NAS — rather than one instance per machine. Every host converges on it for the capabilities that require a live backend; a Mac-local `dev:server` instance exists only as a development/debugging mirror of the same code and is never a second production hub.

**Decision**

- **Server**: the single NAS-hosted `apps/server` instance is the hub. Web (both desktop and mobile browsers) is served same-origin by this instance and calls its `/api/*` endpoints directly. Desktop's `sync`, `codex`, and `provider-config` traffic also targets this same instance in local-bundle mode (4.3), while document access stays local through IPC.
- **Files (knowledge root)**: the knowledge root stays a plain filesystem tree. It is kept in sync between the hub and each desktop machine by Dropbox, running independently on each side (a Dropbox client on the NAS, another on the Mac) — Dropbox is the sync mechanism, not something JARVIS implements. The hub serves this tree to Web/mobile through `/api/context`; Desktop reads and writes its own local Dropbox-synced copy through the IPC-backed `FileSystemContextProvider` described in 4.3, never through the hub's HTTP context API.
- **Records (conversations and tasks)**: the source of truth for both is SQLite on the hub, stored in a data directory kept deliberately outside the Dropbox-synced knowledge root — file-sync tools do not understand SQLite's write-ahead log and can corrupt it if it sits inside a synced folder. Every client (Web, Desktop, Extension) holds a local-first replica (IndexedDB) and reconciles with the hub through one shared sync pattern: push on mutation, pull on startup, and pull again when the window regains focus or becomes visible (throttled), merged per record by `updatedAt` (last-write-wins). This pattern is implemented identically for conversations (`SyncStorageProvider`) and tasks (`ReplicaTaskService`); there is no file-backed task provider anymore.

**Consequences**

- Conversations and tasks converge to one state across every device once each has synced. Completing a task on mobile becomes visible on desktop after the desktop replica's next pull; a client that stays foregrounded without regaining focus will show stale data until its next sync.
- The knowledge root remains a first-class file-domain artifact on both the hub and each desktop machine: Obsidian, git, external agents, and the `codex` CLI can all operate directly on either Dropbox-synced copy.
- Keeping SQLite outside the synced directory means Dropbox never sees or touches it, eliminating the corruption risk that motivated keeping records out of the file domain in the first place.
- The Mac-local server documented as the "development mode" entry in `my-README.md` is not part of the production topology; it exists solely to reproduce and debug issues against the same server code before a change is deployed to the NAS.

## 5. Runtime and External Dependency Chain

- Web, Extension, and Desktop call external model providers through shared runtime contracts.
- Extension and Desktop also bridge browser-controlled pages to access ChatGPT and Gemini history.
- Both the Sync Server and the Desktop host can access the knowledge base through a filesystem adapter layer; the knowledge base is treated as an external dependency even when deployed locally. In the current deployment this filesystem is kept consistent across the hub and desktop machines by Dropbox (see 4.4), external to JARVIS itself.
