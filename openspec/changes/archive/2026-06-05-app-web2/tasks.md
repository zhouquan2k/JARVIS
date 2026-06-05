## 1. Shared UI bootstrap extraction

- [x] 1.1 Add `packages/ui` bootstrap exports for plugin enablement parsing and builtin workspace runtime creation while keeping the host-facing API limited to `core/ui`.
- [x] 1.2 Add a shared `BuiltinWorkspaceHostApp` flow in `packages/ui` that initializes runtime context, contribution query, and unhandled-error wiring for host apps.
- [x] 1.3 Update `packages/ui` package metadata and exports so the new bootstrap path is consumable by host apps without direct `plugin-system` imports.

## 2. Legacy web compatibility

- [x] 2.1 Rewire `apps/web` to reuse the new shared bootstrap helpers where needed without changing its current runtime surface.
- [x] 2.2 Update or add focused `apps/web` tests so shared bootstrap extraction proves the old web host still mounts and renders correctly.
- [x] 2.3 Run package-scoped typecheck/build/tests for `apps/web` after the shared extraction to confirm compatibility is preserved.

## 3. Web2 host implementation

- [x] 3.1 Create the `apps/web2` package structure, configs, and entrypoints for Vite, typecheck, unit tests, and Playwright e2e.
- [x] 3.2 Implement the `apps/web2` host shell, router, host context, context provider, and runtime options so the app layer depends only on `@packages/core` and `@packages/ui`.
- [x] 3.3 Configure `apps/web2` default plugin enablement to exclude task composition while preserving normal knowledge/chat workspace startup behavior.

## 4. Web2 validation

- [x] 4.1 Add unit tests for `apps/web2` root app and context provider bootstrap behavior.
- [x] 4.2 Add Playwright smoke coverage for `apps/web2` that verifies host startup, workspace navigation, and absence of a default task workspace entry.
- [x] 4.3 Run `apps/web2` package-scoped typecheck, build, unit tests, dev startup probe, and Playwright e2e, then summarize any remaining gaps before implementation is considered complete.

## 5. Conversation title and Agent-view rename convergence

- [x] 5.1 Add configurable lightweight-model selection for provider-side title generation and use the first user question to produce a short title, capped at 10 Chinese characters for Chinese output.
- [x] 5.2 Keep linked document names out of the conversation title itself, while still allowing Agent conversation mode to surface related document labels separately.
- [x] 5.3 Move Agent-view rename interaction to the conversation-list toolbar, make only the currently selected local row enter inline edit mode, and remove rename from the detail header.
- [x] 5.4 Update local rename persistence so changing a conversation title does not refresh `updatedAt` or the displayed activity date/time.
