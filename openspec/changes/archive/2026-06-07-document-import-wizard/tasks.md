## 1. Shared Plugin Contracts

- [x] 1.1 Rename the shared document-creation-flow contribution contract to `DocumentImportContribution` in `packages/core` and update `PluginSetupApi` / `ContributionQuery` type exports accordingly.
- [x] 1.2 Add the shared `LanguageModelContribution` contract in `packages/core` and extend plugin-facing registration/query interfaces to expose language-model contributions.
- [x] 1.3 Update `packages/plugin-system` registry, scoped setup, contribution query helpers, and related tests so document imports and language-model contributions register, query, and roll back correctly per plugin.

## 2. Import Wizard Host UI

- [x] 2.1 Add the document import entry near the existing new-document entry in the knowledge workspace document tree and wire it to open a modal import wizard.
- [x] 2.2 Implement the generic import wizard in `packages/ui` with source selection, source-specific configuration rendering, staged execution state, target-directory selection, and success/failure messaging.
- [x] 2.3 Add the host-side import helpers in `packages/ui` / document workspace store for document creation, `references/` resource creation, primary-document opening, and source-invocation plumbing.

## 3. Bilibili Transcript Backend

- [x] 3.1 Add `BilibiliTranscriptService` in `packages/node` to invoke `yt-dlp`, normalize title/subtitle output, and surface explicit fetch failures.
- [x] 3.2 Add the `POST /import/bilibili` route in `apps/server` and return only `{ title, transcript }` without moving summary or document-organization logic into the server.
- [x] 3.3 Add or update backend tests that cover successful transcript fetch normalization and route-level error propagation.

## 4. Import Plugins

- [x] 4.1 Register a `LanguageModelContribution` from `plugins/ai-agent` so import consumers can discover shared text-generation capability through the plugin system.
- [x] 4.2 Create the new `plugins/bilibili-import` plugin with the Bilibili source form, URL/title handling, transcript fetch call, summary gating, and import execution logic.
- [x] 4.3 Implement Bilibili import output writing so transcript-only imports create a normal document, while transcript-plus-summary imports create a summary document plus a transcript resource under `references/` and link it from the summary.
- [x] 4.4 Enable the new import plugin in the affected frontend hosts and update any builtin-plugin tests or fixtures that assert host plugin lists.

## 5. Workspace and Plugin Verification

- [x] 5.1 Add or update unit/component tests for the import wizard host, contribution-query wiring, target-directory defaults, summary availability gating, and failure-state reporting.
- [x] 5.2 Add or update Playwright coverage for the real user flows: open import wizard, complete transcript-only Bilibili import, complete transcript-plus-summary import, and observe stage-specific failure reporting.
- [x] 5.3 Run the required affected lint/type/test/build checks, then run the relevant full E2E surface; if extension hosts are in scope, run extension Playwright with elevated permissions and `channel: 'chromium'`, and rebuild the extension afterward.
