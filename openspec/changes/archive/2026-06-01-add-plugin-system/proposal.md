## Why

JARVIS currently hardcodes AI and task features directly into the frontend hosts, which makes the Markdown workspace core harder to evolve independently and prevents hosts from enabling only the capabilities they need. A minimal frontend plugin system is needed now to separate core document workflows from optional feature surfaces before more cross-cutting features accumulate.

## What Changes

- Add a frontend-only plugin system that lets hosts register built-in plugins, read a global enablement config, and activate only enabled plugins at startup.
- Introduce a minimal shared plugin contract in `packages/core` for plugin manifests, enablement config, setup APIs, read-only contribution queries, and the initial contribution shapes.
- Add plugin-system runtime modules in `packages/plugin-system` to manage plugin activation, contribution registration, duplicate validation, scoped teardown, and host-facing contribution queries.
- Move current AI surfaces into an `ai-agent` plugin and current task surfaces into a `task-mgr` plugin without changing their enabled-state user behavior.
- Change host composition so top-level global views and Agent right-panel tabs are assembled from plugin contributions instead of hardcoded imports.
- Reserve a controlled document-creation-flow extension point for future plugins that extend Markdown document creation around the core workspace flow.
- Keep backend-facing capabilities such as `IContextProvider` and task persistence out of scope for this phase.

## Capabilities

### New Capabilities

- `plugin-system`: Frontend plugin manifests, enablement, contribution registration, and host composition for global views, right-panel tabs, and document creation flows.

### Modified Capabilities

None.

## Impact

- Affected shared contracts in `packages/core`, especially new plugin-facing type-only interfaces.
- New frontend runtime package surface in `packages/plugin-system`.
- New plugin packages under `plugins/ai-agent` and `plugins/task-mgr`.
- Host composition changes in `apps/web`, `apps/desktop`, and `apps/extension` so they provide builtin plugin lists, activate enabled plugins, and inject contribution queries into shared UI.
- Shared UI assembly changes in `packages/ui` so global views and Agent right-panel tabs are rendered from registered contributions.
- No new external dependency is required, and no backend protocol or storage migration is expected in this phase.
