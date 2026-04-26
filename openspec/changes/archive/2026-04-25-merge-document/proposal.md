## Why

Agent conversations in the knowledge workspace can refine the active document's problem statement and solution over multiple turns, but that knowledge currently remains trapped in chat history. We need a fast way to merge the current agent conversation back into the selected Markdown Q/A document so the document stays authoritative and users can still inspect and undo the change through the existing file history workflow.

## What Changes

- Add a one-click archive action that is available only in agent mode when the currently selected node is the active writable Markdown document.
- Merge the entire current visible conversation into the active document by splitting the document into `Q` and `A` sections at the first Markdown standard divider.
- Rewrite user messages into a concise structured `Q` section and merge assistant messages into a deduplicated structured `A` section with latest content taking precedence.
- Skip preview confirmation and write the merged document immediately.
- Route archive writes through the existing workspace file change pipeline so line diff, undo, and redo continue to work.
- Show success, no-change, and failure feedback for the archive action without changing the current chat mode.
- Persist archive status on the current conversation so the workspace can tell whether the active conversation has already been archived.
- Show the persisted archive status in the chat UI so users can see whether the current conversation is archived, stale after new turns, or has never been archived.

## Capabilities

### New Capabilities
- `conversation-document-archive`: Archive the active agent conversation into the current Markdown Q/A document and keep the result undoable through workspace file history.

### Modified Capabilities
- `knowledge-workspace`: Add archive eligibility rules tied to the selected Markdown document and require archive writes to flow through workspace diff and undo/redo behavior.
- `conversation-workspace`: Add the agent-mode archive entry point, persist archive status on the local conversation, and surface that status in the chat workspace UI.

## Impact

- Affected UI and stores in `packages/ui`, especially the normal chat view, chat store, and document workspace store.
- Affected conversation persistence contracts in `packages/core` and the local conversation storage flow because archive status must survive reload.
- Adds a new archive orchestration service for Q/A splitting, merge prompt construction, and result synthesis.
- Reuses existing model provider selection, context provider document I/O, and file change history infrastructure; no new server API is required.
