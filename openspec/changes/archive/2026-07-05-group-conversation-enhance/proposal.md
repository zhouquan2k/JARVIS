## Why

Group conversations currently merge all member replies into a single long assistant message (separated by `### member-name` headings), making it difficult for users to quickly compare different models' viewpoints. There is also no mechanism to synthesize the members' perspectives into a structured summary highlighting consensus, complementary insights, and conflicts.

## What Changes

- **Group reply rendering**: Each group turn now renders as a tabbed message card — a `Summary` tab (default) plus one tab per member — instead of a single merged Markdown bubble.
- **Auto summarizer**: After all members finish (≥2 members), a preset-level fixed summarizer model automatically generates a structured summary (consensus / complementary / conflicts) with `@member` source attribution as clickable chips.
- **Single-member fallback**: When only 1 member participates, no Summary tab is shown and the reply degrades to a normal bubble.
- **Streaming tab UX**: During streaming, the default tab is the first member; after summarization completes (and the user has not manually switched tabs), the view auto-switches to the Summary tab.
- **Panel ↔ full-screen toggle symmetry**: The "expand to full-screen" button (already in the right-panel toolbar) gets a symmetric "collapse to panel" counterpart in the full-screen chat header.
- **Document follow-on context switch**: When switching workspace/conversation, the first associated document (`documentIds[0]`) is automatically opened and focused; absent association is a no-op.

## Capabilities

### New Capabilities

- `group-message-tabs`: Tab-based rendering of group conversation turns with per-member tabs, summary tab, streaming status indicators, and `@member` chip navigation.
- `group-summarizer`: Auto-summarization of group turns by a preset-configured summarizer model; produces structured consensus/complementary/conflict output; triggered only when ≥2 members participate.
- `conversation-context-follow`: Automatic document open/focus when switching conversation or toggling panel↔full-screen; uses `Conversation.documentIds` already stored on the conversation.

### Modified Capabilities

- `core-interfaces`: `ProviderStreamUpdate`, `ProviderSendResult`, and `ConversationMessage` gain optional `groupMembers?: GroupMemberPart[]` and `groupSummary?: GroupSummaryPart` fields (additive, backward-compatible).
- `static-config`: `APP_CONFIG` gains `groupSummarizers: Record<presetId, { providerId; modelId; systemPrompt? }>` alongside existing `groupPresets`.

## Impact

- **`plugins/ai-agent`**: `group/groupTypes.ts`, `interfaces/IModelProvider.ts`, `interfaces/Conversation.ts`, `store/chat.ts`, `providers/model/MultiModelGroupProvider.ts`, `runtime/createModelProviderRuntime.ts`, new `group/groupSummaryPrompt.ts`, new `components/GroupMessageTabs.vue`, `views/NormalChatView.vue`, `components/AgentConversationPanel.vue`.
- **`packages/core`**: `config.ts` (new `groupSummarizers` field).
- **`packages/ui`**: `views/WorkspaceHostApp.vue` (document follow-on bridge); `store/documentWorkspace.ts` reuses existing `openNode()`.
- **No breaking changes**: all new fields are optional; existing conversations without `groupMembers` continue to render via the existing Markdown path.
