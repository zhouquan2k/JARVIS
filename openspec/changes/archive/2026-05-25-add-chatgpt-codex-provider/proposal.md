## Why

ChatPrism currently offers ChatGPT Web and Gemini-backed model providers, but it does not expose the ChatGPT subscription Codex experience as a first-class provider. We need a unified Codex provider that works consistently across web, extension, and desktop, supports authenticated usage through a server-backed execution path, and participates in Agent mode without relying on external history import.

## What Changes

- Add a new unified `chatgpt-codex` model provider that is available in `web`, `extension`, and `desktop` runtime modes.
- Back the provider with a local server execution path that wraps the installed `codex` CLI for auth status, login initiation, model discovery, normal chat execution, and Agent execution.
- Add host-side authentication recovery flows for web, extension, and desktop so users can sign in to Codex from each surface and retry provider initialization without restarting the app.
- Allow the new provider to implement `IAgentCapableProvider` and participate in ChatPrism Agent mode.
- Keep external history import unchanged and explicitly exclude Codex from external history provider responsibilities.

## Capabilities

### New Capabilities
- `chatgpt-codex-provider`: Unified Codex provider behavior for model catalog resolution, authentication, normal chat requests, and Agent-capable execution across all supported hosts.
- `provider-proxy-server`: Local server routes and services that expose Codex auth and execution APIs to web, extension, and desktop hosts through one server-backed path.

### Modified Capabilities
- `runtime-mode-provider-injection`: Runtime filtering and provider factory injection must include `chatgpt-codex` in `web`, `extension`, and `desktop` while preserving fresh-instance semantics.
- `web-host-app`: Web host requirements must cover Codex auth recovery, server-backed provider wiring, and provider availability in the shared workspace.
- `extension-host-app`: Extension host requirements must cover Codex auth recovery and direct use of the server-backed Codex provider instead of a background-only host path.
- `desktop-host-app`: Desktop host requirements must cover Codex auth recovery and direct use of the server-backed Codex provider instead of the desktop ChatGPT Web session path.

## Impact

- Affected code: `packages/core` provider/runtime code, `apps/server` routes/services/config, and host bootstrap/UI code in `apps/web`, `apps/extension`, and `apps/desktop`.
- New dependency path: local `codex` CLI becomes the execution backend for this provider, including its ChatGPT login state.
- APIs: new local server endpoints for Codex auth, model catalog lookup, normal execution, and Agent execution.
- Validation: requires unit coverage across core/server/hosts plus end-to-end coverage for auth recovery and provider availability on all three hosts.
