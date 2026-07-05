English | [Chinese](proposal.zh-CN.md)

## Why

JARVIS currently requires a locally running server per machine, keeps conversations in per-server SQLite files that never merge, and stores all tasks in a single `tasks.json` that conflicts under multi-device file sync. As mobile (responsive web2) access is now in place, we need a topology where one always-on hub owns all record data (conversations + tasks), documents stay as plain files synced by Dropbox, and the desktop works fully offline — without exposing an unauthenticated server (which can execute local CLI commands via `/api/codex`) to the public internet.

The full architecture and decision log live in `docs/online-refactor.md` (D1–D9). Phase 0 (VPS + Tailscale + Dropbox) is **already deployed**. This change implements roadmap phases 1–4; phase 5 (global search/RAG) is explicitly **not** to be implemented (design archived for reference).

## What Changes

- **Phase 1 — Daily-use traffic switches to the VPS; the local server is retained only as a development simulator (config only)**: phone web2 and browser access use the single VPS server (reachable via Tailscale) for conversations and documents. The desktop is launched in a production-like mode that points directly at the VPS, while the Mac local server is no longer part of any daily-use flow. The local server is still kept for local development, especially to simulate the VPS for web2 hot reload and API debugging. Local files remain on the Mac, synced with the VPS via Dropbox (Obsidian/local editors keep working). Phase 1 acceptance now focuses on sync/context convergence plus automated amd64 deployment of the NAS-hosted server; codex migration is deferred for now. Interim limitation until phase 3: the JARVIS UI is unavailable on an offline Mac; offline document edits go through Obsidian on local files.
- **Phase 2 — Tasks migrate into the record domain**: tasks move from `tasks.json` (file domain) into hub SQLite, synced to clients through the existing sync protocol pattern (client IndexedDB replica, cursor + dirty tracking, per-task LWW merge by `updatedAt`). Includes a server-side task allowlist normalizer, a one-time `tasks.json` → DB migration, and relocating Google Calendar sync to the hub. Task views become offline-capable on every client.
- **Phase 3 — Desktop file domain goes IPC; offline capability restored**: the Electron renderer loads from a local bundle instead of a server origin; documents are accessed through an IPC-backed context provider (main process hosts `FileSystemContextProvider` with `conversationQueryProvider=null`) reading the local Dropbox replica; sync HTTP goes through a main-process fetch proxy; bilibili import moves to IPC; codex stays on the VPS (no local channel). **BREAKING** for the desktop launch flow (no local server at all).
- **Phase 4 — Mobile web2 / PWA readiness**: keep the service-worker offline shell, read-only recent-document cache, and add-to-home-screen manifest code in place, but narrow final acceptance for this change to phone **online mode** only; real-phone offline and standalone-launch validation move to a future change after HTTPS / secure-context hosting is available.
- Out of scope: phase 5 (global search/RAG — explicitly not implemented), projection materialization (D8 item 3), app-level authentication.

## Capabilities

### New Capabilities

- `task-record-sync`: tasks stored as records in the hub database and replicated to clients — hub-side task storage and sync endpoints, client-side IndexedDB replica with offline read/write, per-task LWW conflict resolution, `tasks.json` one-time migration, and hub-located Google Calendar sync.

### Modified Capabilities

- `sync-server`: sync API extends beyond conversations to task resources (push/pull with independent cursor), including a task whitelist normalizer mirroring the conversation normalizer contract (delta is additive — conversation behavior unchanged).
- `desktop-host-app`: desktop runs without a local server process — renderer loads from local bundle, documents via IPC-delivered context provider, record sync reaches the remote hub via main-proxied fetch (delta is additive — the existing mechanism-agnostic context provider contract is unchanged).
- `web2-host-app`: web2 gains mobile/PWA behavior — retaining the service-worker app shell, read-only document cache, and installable manifest code, while this change's acceptance narrows to usable phone online mode.

Note: `sync-storage-provider` and `task-provider-contract` stay untouched — the task replica is a new component inside `task-record-sync` (design decision D-2), and the `TaskService` contract is preserved.

## Impact

- **Server** (`apps/server`): sync routes/repository/schema gain task tables + endpoints + normalizer; calendar sync wiring moves behind hub config.
- **Plugins**: `plugins/task-mgr` data layer switches to replica-backed provider; `plugins/ai-agent` sync transport unchanged (target URL becomes configurable per build).
- **Desktop** (`apps/desktop2`): renderer loading, preload/IPC surface for context provider and import; removal of server-origin dependency.
- **Packages**: `packages/node` `FileSystemContextProvider` reused in Electron main (optional `conversationQueryProvider` already supports null); `packages/core` config for hub URLs.
- **Docs/ops**: `my-README.md` launch flows, the NAS amd64 deployment script; `docs/online-refactor.md` stays the architecture source of truth.
- **Data migration**: one-time `tasks.json` import into hub SQLite; conversations require no migration (hub designation is config).
