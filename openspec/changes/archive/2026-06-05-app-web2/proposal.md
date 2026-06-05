## Why

JARVIS currently evolves the existing `apps/web` host by incrementally stripping business logic out of a codepath that still carries substantial historical coupling. That makes each app-layer simplification expensive, because the old host must be untangled while still serving as the active runtime shell.

Creating a new `apps/web2` host now provides a cleaner path: establish a fresh web host that starts from the target architecture, depends only on `packages/core` and `packages/ui`, and reuses existing packages/plugins through shared bootstrap surfaces instead of continuing to refactor the legacy host in place.

## What Changes

- Add a new `apps/web2` web host that can boot and run the same core workspace flows as the current web app while keeping the app layer free of task-specific and plugin-assembly logic.
- Add or refine `packages/ui` bootstrap surfaces so a web host can initialize builtin workspace runtime and render the shared host shell without directly depending on `packages/plugin-system` from the app layer.
- Keep the legacy `apps/web` host working during the transition, including when shared bootstrap code moves into `packages/ui`.
- Limit the first phase to app-layer extraction only; business logic that still lives inside `packages/ui` remains in place for now and will be peeled out in later changes.
- Default `apps/web2` to a non-task host composition so the new app does not embed task-specific app logic.

## Capabilities

### New Capabilities

- `web2-host-app`: A new web host app that boots the shared workspace through `packages/ui`, matches the current web app's core runtime behavior, and keeps app-layer dependencies limited to `packages/core` and `packages/ui`.

### Modified Capabilities

None.

## Impact

- New app package under `apps/web2` with its own Vite, typecheck, unit-test, and e2e entrypoints.
- Shared bootstrap changes in `packages/ui` so host apps can obtain builtin workspace runtime without direct `plugin-system` imports.
- Possible narrow type or helper exports in `packages/core` and `packages/ui` to support the new host boundary.
- No removal of `apps/web`; the existing web app must remain runnable and behaviorally intact while `web2` is introduced.
- No server API, storage schema, or plugin capability redesign is required in this phase.
