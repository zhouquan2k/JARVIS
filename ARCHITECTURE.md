[English](ARCHITECTURE.md) | [中文](ARCHITECTURE.zh-CN.md)

# Architecture

`docs/workspace.dsl` is the primary public architecture source for this repository. This document explains the system context and container views defined there and should be updated together with the DSL.

## System Context

ChatPrism sits between end users, external AI providers, and the user's knowledge repository.

### Primary actor

- Power AI users who compare model outputs, recover conversation history, and curate knowledge assets.

### External systems

- ChatGPT Web for login-backed model access and conversation history.
- Google Gemini API for model execution and model catalog queries.
- Gemini Web for browser-driven history extraction.
- A local or hosted knowledge repository for documents, imported files, and scoped workspace context.

## Container View

### Browser Extension App

- Hosts chat, comparison, history import, and knowledge workspace flows inside the browser.
- Uses browser capabilities such as cookies, content scripts, and extension storage.

### Web App

- Provides the main browser-based workspace for chat, comparison, and document-centric work.
- Relies on the sync server for shared context and provider configuration.

### Desktop App

- Extends the shared UI with desktop-only file and controlled-page capabilities.
- Reuses shared packages while adding Electron-hosted bridge logic.

### Sync Server

- Exposes conversation sync APIs, context APIs, and provider configuration endpoints.
- Connects shared contracts to filesystem- or database-backed persistence.

### Shared Packages

- `packages/core`: domain models, runtime abstractions, provider contracts, and workflow orchestration.
- `packages/ui`: reusable UI components, views, and state used by Web, Extension, and Desktop renderers.
- `packages/node`: Node-only adapters and infrastructure reused by Desktop main and the sync server.

## Responsibility Boundaries

- Host apps assemble capabilities for their runtime, but they do not redefine shared contracts.
- Shared packages hold the reusable conversation, provider, and context abstractions.
- The sync server is the public backend boundary for remote context and synchronization.
- The knowledge repository remains an external dependency even when it is mounted locally.

## External Dependency Flow

- The Web, Extension, and Desktop hosts call external model providers through shared runtime contracts.
- Extension and Desktop hosts also bridge browser-controlled history access for ChatGPT and Gemini.
- The sync server and desktop host can both access the knowledge repository through filesystem-aware adapters.

## Related Documents

- Repository overview: [README.md](README.md)
- C4 DSL source: [docs/workspace.dsl](docs/workspace.dsl)
- Documentation scope: [docs/overall.md](docs/overall.md)
- Context provider details: [docs/context-provider.md](docs/context-provider.md)
