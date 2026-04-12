[English](CONTRIBUTING.md) | [中文](CONTRIBUTING.zh-CN.md)

# Contributing

## Principles

- Keep runtime changes scoped and observable.
- Treat `docs/workspace.dsl` as the primary architecture source for public design discussions.
- Preserve the English-first public documentation structure introduced in Phase 1.

## Development Setup

```bash
pnpm install
pnpm lint
pnpm --filter server dev
pnpm --filter web dev
```

Use package-local scripts for focused work such as `pnpm --filter web test` or `pnpm --filter desktop build`.

## Documentation Rules

- Keep the English document on the primary path.
- Add a Chinese mirror for every public entry document that participates in Phase 1.
- Place mirrored `docs/` files under `docs/zh/`.
- Add reciprocal `English | 中文` navigation at the top of each mirrored public document.
- Update [GLOSSARY.md](GLOSSARY.md) when introducing new public-facing terminology.
- Do not migrate or rewrite files under `docs/history/` unless a change explicitly widens the scope.
- For static user-visible copy, route the text through UI i18n instead of hardcoding new strings in host runtime files.
- For user-visible errors and recovery prompts, use English default messages and reuse existing error codes instead of adding exception translation dictionaries.
- For formal OpenSpec documents, submit English primary files and Chinese mirrors together, and keep `openspec/changes/archive/**` out of the bilingual requirement.
- When opening issues or pull requests, use the English-first `.github` templates and check the UI i18n, error-message, and bilingual OpenSpec items.

## Architecture Updates

- Update [docs/workspace.dsl](docs/workspace.dsl) when context or container boundaries change.
- Keep [ARCHITECTURE.md](ARCHITECTURE.md) aligned with the context and container views from the DSL.
- When the English DSL changes, update the Chinese mirror at `docs/zh/workspace.zh-CN.dsl` in the same change.

## Validation Expectations

Before merging a substantial change, run the narrowest commands that still validate the affected area:

- `pnpm lint`
- package-level build or type checks
- package-level or targeted Playwright/Vitest coverage when UI or browser flows change

For extension browser tests, use Chromium with extension loading enabled.
