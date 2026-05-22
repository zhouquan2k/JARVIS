## Why

Knowledge-workspace documents can already link to other files, but they cannot reference the agent conversations that produced the decision, rationale, or draft content. That makes it hard to turn a document into a durable hub that points back to the relevant discussion context.

Users need a lightweight way to insert a link to an existing conversation from the current Agent scope and reopen that conversation from the document later. For this change, conversation-level navigation is sufficient; question-level deep links are intentionally out of scope to keep the link format and navigation behavior simple.

## What Changes

- Add a new Markdown toolbar action for inserting a conversation link while editing a workspace document.
- Let the chooser list local conversations from the current Agent scope so users do not need to copy ids or hand-author custom Markdown hrefs.
- Persist inserted conversation links in Markdown source using an application-managed href format that identifies the target conversation only.
- Extend Markdown viewer link handling so clicking a conversation link opens the corresponding conversation in the right-side Agent pane.
- Ensure the right-side conversation panel can honor an external “open this conversation” request even when it is currently showing the conversation list.
- Explicitly exclude question-level deep linking, question scroll targeting, and cross-agent conversation browsing from this change.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `knowledge-workspace`: Add a Markdown conversation-link insertion flow that reuses the current Agent conversation scope and routes clicked conversation links back into the workspace shell.
- `conversation-workspace`: Let the right-side Agent conversation surface open a requested local conversation directly from workspace link navigation and switch to detail mode when needed.

## Impact

- Affected middle-pane authoring/viewer path: `packages/ui/src/components/DocumentEditorPane.vue`, `packages/ui/src/document-viewers/MarkdownDocumentViewer.vue`, and `packages/ui/src/utils/markdownDocument.ts`.
- Affected knowledge-workspace coordination path: `packages/ui/src/views/DocumentWorkspaceView.vue`, `packages/ui/src/components/AgentView.vue`, and `packages/ui/src/components/AgentPane.vue`.
- Affected right-pane conversation path: `packages/ui/src/components/AgentConversationPanel.vue` and `packages/ui/src/store/chat.ts`.
- Affected tests: middle-pane unit tests, workspace view integration tests, and end-to-end coverage for inserting and opening conversation links.
