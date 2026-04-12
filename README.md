[English](README.md) | [中文](README.zh-CN.md)

# ChatPrism

ChatPrism is a multi-host AI workspace for people who compare answers across models, revisit long-running conversations, and turn chat history into reusable knowledge.

## What It Includes

- Web, browser extension, and desktop hosts that share the same conversation workflows.
- A sync server for conversation storage, workspace context APIs, and provider configuration.
- Shared `packages/core`, `packages/ui`, and `packages/node` modules that keep host-specific code thin.
- A document workspace for reading, editing, indexing, and reusing knowledge files.

## Core Use Cases

- Ask the same question to multiple providers and compare their answers side by side.
- Import or recover conversation history from external AI products.
- Search and organize long-running discussions as reusable knowledge assets.
- Attach scoped workspace context to agent-style workflows.

## Public Entry Points

- Architecture overview: [ARCHITECTURE.md](ARCHITECTURE.md)
- Contribution guide: [CONTRIBUTING.md](CONTRIBUTING.md)
- Security policy: [SECURITY.md](SECURITY.md)
- Repository glossary: [GLOSSARY.md](GLOSSARY.md)
- Primary C4 source: [docs/workspace.dsl](docs/workspace.dsl)
- Documentation scope: [docs/overall.md](docs/overall.md)

## Quick Start

```bash
pnpm install
pnpm lint
pnpm --filter server dev
pnpm --filter web dev
```

For browser-level regression and workspace flows, use the Playwright suites under `apps/web/tests/e2e` and `apps/extension/tests/e2e`.

## Documentation Model

- English documents are the default public entry points.
- Chinese mirrors are linked explicitly from the English source.
- Historical phase documents under `docs/history/` remain available, but they are not part of the Phase 1 public-document migration.

## License

This repository is published under the [MIT License](LICENSE).
