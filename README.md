[English](README.md) | [中文](README.zh-CN.md)

# JARVIS

JARVIS is a human-AI collaboration space for evolving Markdown documents around real problem domains. It is designed for cases where the user provides background, constraints, and judgment, while the AI contributes plans, edits, and reusable written output directly into the workspace.

Rather than treating chat as disposable conversation, JARVIS treats documents as the durable center of collaboration. The goal is to help a person and an AI jointly maintain context, refine solutions, and turn ongoing discussion into structured knowledge.

## UI Screenshots

![JARVIS UI screenshot 1](docs/screenshots/1777231314622.jpg)

![JARVIS UI screenshot 2](docs/screenshots/1777234089398.jpg)

## What JARVIS Is

- A workspace organized by problem domains, represented as a tree of folders and Markdown files.
- A collaboration model where each directory can be bound to a dedicated Agent configuration.
- A document-centric system where the user and AI co-edit the same files instead of keeping context only inside chat history.
- A bridge between discussion and execution: JARVIS focuses on producing high-level plans and knowledge artifacts that can later be handed off to execution systems.

## Core Concepts

### Problem-Domain Workspace

Documents are organized by problem domain. A folder represents a scope of work and can be associated with a specific Agent. That Agent uses the current directory and its child content as primary context for discussion and writing.

### Flexible Q/A Convention

JARVIS uses a lightweight convention rather than a hard schema:

- `Q` captures the user's problem domain, background, constraints, and question.
- `A` captures candidate solutions, proposals, and refinements.

Both live in the same Markdown document. As the conversation evolves, the user and the AI can both update either side. The system does not strictly enforce the structure; it supports block-level document collaboration and lets the convention remain flexible.

### Context Assembly

When the user asks a question, context can be assembled from multiple layers:

- The active document.
- Files explicitly included through `@` references.
- Other relevant files selected by the Agent based on directory scope and document summaries.

This allows the AI to work with long-running context without forcing every detail into a single chat thread.

### Block-Level Diff and Merge

The AI does not directly overwrite documents. It proposes edits as block- or paragraph-oriented changes to the active Markdown file. The user reviews those diffs and decides whether to accept or reject them before they are merged into the document.

### Summary Refresh on Save

Any document save event, whether from manual editing or merge confirmation, triggers an asynchronous background summary refresh. These summaries are used as a context index so Agents can discover relevant files more accurately in later interactions.

## Workflow

1. The user stores shared documents in a workspace tree organized by problem domain.
2. A directory is associated with an Agent configuration.
3. The user asks a question, optionally forcing file inclusion with `@`.
4. The Agent assembles context from the active document, referenced files, and relevant summaries.
5. The Agent responds in chat and proposes block-level edits to the active document.
6. The user reviews and merges accepted changes.
7. Saving the document refreshes its summary for future retrieval.

## Product Boundaries

- JARVIS is not primarily a task execution system. It is a text-level knowledge and solution production hub.
- The main unit of collaboration is Markdown, not code ASTs or strongly typed domain objects.
- The Q/A pattern is a user convention, not a hard validation rule.

## Current Status and Risks

The product direction described above comes from [docs/new_overall.md](docs/new_overall.md). Some repository artifacts still reflect an earlier multi-host AI workspace framing, so the README should be read as the current product intent while older architecture materials remain useful as implementation context.

Key risks currently called out in the product notes:

- Summary refreshes need queueing or debounce behavior to avoid save-storm conflicts.
- Long documents may cause the model to update `A` without fully propagating changes back to `Q`.
- Async summary failures need explicit visibility so the system does not silently rely on stale context.
- The exact Markdown block-diff algorithm still needs engineering validation.

## Documentation

- Product direction: [docs/index.md](docs/index.md)
- Architecture overview: [ARCHITECTURE.md](ARCHITECTURE.md)
- Contribution guide: [CONTRIBUTING.md](CONTRIBUTING.md)
- Security policy: [SECURITY.md](SECURITY.md)
- Repository glossary: [GLOSSARY.md](GLOSSARY.md)
- Current C4 source for implementation context: [docs/workspace.dsl](docs/workspace.dsl)

## License

This repository is published under the [MIT License](LICENSE).
