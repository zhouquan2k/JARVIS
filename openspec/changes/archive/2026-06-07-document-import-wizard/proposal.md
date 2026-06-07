## Why

JARVIS currently lacks a structured way to turn external resources into workspace Markdown documents. Users can save links, but they cannot reliably transform a valuable Bilibili video into editable transcript and summary documents that become durable knowledge assets inside the workspace.

## What Changes

- Add a generic document import wizard in the knowledge workspace so external resources can be imported into Markdown documents through plugin-provided sources.
- Deliver the first real import source as a Bilibili video importer that produces a transcript document and an optional summary document.
- Rename the existing document-creation flow contribution contract to a document-import contribution contract and repurpose it as the plugin extension point behind the wizard.
- Add a shared language-model contribution contract so summary generation is provided by plugins rather than hardwired in the host or workspace shell.
- Reuse the existing `references/` protected-resource pattern so transcript files can be stored as referenced resources when a summary document is also generated.
- Add a thin server-side Bilibili transcript fetch route backed by `yt-dlp`, while keeping import orchestration, summary generation, and document organization in the frontend plugin boundary.

## Capabilities

### New Capabilities
- `document-import-wizard`: A plugin-driven import wizard that lets users select an import source, configure source-specific parameters, run staged import execution, and open the created main document on success.

### Modified Capabilities
- `plugin-system`: The plugin contribution model must expose document-import contributions and shared language-model contributions through the existing setup/query contracts.
- `knowledge-workspace`: The workspace shell must expose an import entry near document creation, host the import wizard flow, and organize transcript/reference outputs according to the selected import result shape.

## Impact

- Affected code: `packages/core`, `packages/plugin-system`, `packages/ui`, `packages/node`, `apps/server`, `plugins/ai-agent`, and a new `plugins/bilibili-import` plugin.
- API impact: renames `DocumentCreationFlowContribution` to `DocumentImportContribution`, adds `LanguageModelContribution`, and extends plugin setup/query registration surfaces.
- Runtime/dependency impact: server environments that enable Bilibili import require `yt-dlp`; frontend hosts must include the new builtin import plugin.
- Validation impact: requires workspace UI coverage for the wizard flow, plugin registration coverage for new contribution types, server coverage for transcript fetching, and end-to-end validation of transcript-only and transcript-plus-summary imports.
