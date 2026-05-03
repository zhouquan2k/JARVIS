## Why

The workspace has several small but high-impact usability gaps across document reading, conversation management, persistence feedback, message readability, and agent folder entry pages. Addressing them together improves daily navigation and review workflows without changing the overall host architecture.

## What Changes

- Add in-document keyword search for the active markdown document, opened by `Ctrl+F` / `Cmd+F`, with match highlighting and previous/next navigation; keep a viewer-level search interface available for future non-Markdown viewers.
- Allow users to rename local conversation history entries from the conversation sidebar.
- Allow users to edit a prior human message directly from the chat transcript, copy it back into the composer, and resend from that point while deleting later conversation turns.
- Make the document save button visually reflect the active document dirty/saving state.
- Add shared, collapsible functional message parts for function calls, tool calls, search traces, and similar operational details across normal chat, agent mode, and previewed/imported conversations when structured data is available.
- Support explicit `@filename` references in chat input to load workspace files as additional context; preserve the existing first-turn auto-attachment of the current selected document and inject referenced file contents as standalone prompt sections labeled by filename.
- Show an existing `index.md` as the default visible document when an Agent owner folder is selected, while preserving the active Agent context.
- Add localized UI copy for the new controls and states.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `conversation-workspace`: Rename local conversations and render shared collapsible functional message details in the normal chat surface.
- `conversation-workspace`: Add in-thread human-message edit-and-resend with tail truncation for later turns.
- `knowledge-workspace`: Search within active markdown documents through a reusable viewer search interface, show dirty save state, display Agent folder `index.md` default pages, and serve as the file-resolution source for chat `@filename` references.
- `core-interfaces`: Extend conversation/provider message contracts with shared functional message parts.
- `agent-runtime-adapter`: Emit structured functional parts for Agent tool-loop calls and results.
- `chatgpt-web-provider`: Normalize structured search/tool/function metadata into functional message parts where available.
- `gemini-api-provider`: Normalize structured function/tool metadata into functional message parts where available.
- `localized-ui-copy`: Add user-facing strings for markdown search, conversation rename, save dirty state, and functional detail controls.

## Impact

- Affected shared UI components and stores: `DocumentEditorPane`, `MarkdownDocumentViewer`, `ConversationSidebar`, `NormalChatView`, `DocumentWorkspaceView`, `chat` store, and `documentWorkspace` store.
- Additional conversation-edit scope: `NormalChatView`, localized UI copy, and the shared `chat` store question/message lifecycle.
- Affected shared contracts: `ConversationMessage`, provider stream/result types, clone and normalization helpers.
- Affected provider/runtime paths: Agent runtime tool loop, ChatGPT Web provider metadata normalization, Gemini API provider function/tool metadata normalization, chat request prompt augmentation, and proxy passthrough types.
- No new external dependencies are expected.
