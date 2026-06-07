[English](overall.md) | [中文](zh/overall.zh-CN.md)

# Repository Overview

## Product Summary

ChatPrism is a multi-host AI workspace for users who need dependable answer comparison, long-lived conversation recovery, and document-centric knowledge organization.

## Primary Audience

- Power AI users validating important decisions across multiple models.
- People who want to search, revisit, and refine long conversations.
- Individual knowledge workers who want to turn chat output into reusable documents.

## Value Proposition

- Compare multiple model responses before accepting a conclusion.
- Recover and search conversation history across hosts.
- Turn repeated AI output into structured knowledge artifacts.
- Reuse existing provider accounts instead of forcing a separate hosted subscription model.

## Public Documentation Scope

Phase 1 public documentation covers:

- Root entry docs such as `README.md`, `CONTRIBUTING.md`, and `ARCHITECTURE.md`.
- Core `docs/` pages that explain repository scope, context providers, and the primary C4 DSL.
- Chinese mirrors stored under `docs/zh/`.

Historical files under `docs/history/` remain available but are explicitly out of scope for the Phase 1 public-document migration.

## Architecture Summary

- Shared runtime contracts live in `packages/core`.
- Shared interface and workspace views live in `packages/ui`.
- Node-only adapters live in `packages/node`.
- Host assembly happens in `apps/web`, `apps/extension`, `apps/desktop`, and `apps/server`.

See [../ARCHITECTURE.md](../ARCHITECTURE.md) and [workspace.dsl](workspace.dsl) for the public architecture entry.
