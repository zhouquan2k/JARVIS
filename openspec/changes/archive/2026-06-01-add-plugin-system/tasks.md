## 1. Core plugin contracts

- [x] 1.1 Add plugin contract types to `packages/core`, including `PluginManifest`, `PluginEnablementConfig`, `PluginSetupApi`, `ContributionQuery`, and the three initial contribution shapes.
- [x] 1.2 Export the new plugin contracts from the `packages/core` public entrypoints without introducing Vue or plugin-runtime dependencies.
- [x] 1.3 Add unit tests or type-level checks that verify the core plugin contracts stay runtime-agnostic and support the required contribution signatures.

## 2. Plugin-system runtime

- [x] 2.1 Create `packages/plugin-system` runtime modules for `PluginRegistry`, `PluginManager`, scoped setup facades, duplicate-contribution validation, and plugin-scoped teardown.
- [x] 2.2 Add tests for config-driven activation, failure isolation, deterministic contribution ordering, duplicate-ID rollback, and `removeByPlugin()` cleanup behavior.
- [x] 2.3 Add Vue-specific contribution type aliases in `packages/plugin-system` for plugin authors while keeping the stored contract generic.

## 3. First-party plugin extraction

- [x] 3.1 Create `plugins/ai-agent` with a manifest that registers the current AI global view and Workspace right-panel conversation tab.
- [x] 3.2 Create `plugins/task-mgr` with a manifest that registers the current all-tasks global view and Workspace right-panel task tab.
- [x] 3.3 Rename the shared right-panel host from `AgentRightPane` to `WorkspaceRightPane` and update its references/tests to reflect workspace-level ownership.
- [x] 3.4 Move AI feature implementations out of `packages/ui` and into `plugins/ai-agent`, including the chat global view stack, compare/history/conversation surfaces, and right-panel conversation implementation.
- [x] 3.5 Move task feature implementations out of `packages/ui` and into `plugins/task-mgr`, including the all-tasks global view stack, task list/editor surfaces, and right-panel task implementation.
- [x] 3.6 Remove AI/task feature exports from `packages/ui` once plugin-local ownership is in place, keeping only workspace-core and reusable primitives in shared UI.

## 4. Host and shared UI wiring

- [x] 4.1 Update `apps/web`, `apps/desktop`, and `apps/extension` to define builtin plugin lists, load plugin enablement config, activate enabled plugins, and inject `ContributionQuery` into shared UI.
- [x] 4.2 Update shared shell/UI components to assemble top-level global views and Workspace right-panel tabs from `ContributionQuery` without AI/task fallback implementations embedded in shared UI.
- [x] 4.3 Add the initial document-creation-flow query/wiring path so future plugins can register controlled document creation flows without changing host composition again.
- [x] 4.4 Update unit tests to inject `ContributionQuery` explicitly for shared workspace shells instead of depending on built-in AI/task tabs.

## 5. Verification

- [x] 5.1 Add or update Playwright coverage for contribution-driven host assembly, including enabled AI/task surfaces, disabled-plugin absence, and preserved Markdown workspace core behavior.
- [x] 5.2 Run package-level lint, typecheck, and test commands for the touched packages and hosts.
- [x] 5.3 Run the target production builds for affected hosts, including `pnpm --filter extension build` after extension-side verification.
