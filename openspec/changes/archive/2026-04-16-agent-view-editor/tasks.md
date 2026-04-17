## 1. Core Agent Config Semantics

- [x] 1.1 Add `AgentInheritanceMode = 'merge' | 'override'` and `inheritance?: AgentInheritanceMode` to `AgentConfig` / `ResolvedAgentConfig`.
- [x] 1.2 Update `.agent.json` parsing to accept only missing, `merge`, or `override` inheritance values and reject invalid values with a diagnostic error.
- [x] 1.3 Update scoped Agent resolution so missing/`merge` inherits parent config and merges prompts parent-to-child.
- [x] 1.4 Update scoped Agent resolution so `override` truncates parent/default inheritance and uses only explicitly declared fields from that config level.
- [x] 1.5 Add resolver tests for default merge, explicit merge, override truncation, deeper child merge after override, and invalid inheritance values.

## 2. Agent Config Persistence

- [x] 2.1 Add `saveAgentConfig(input)` to `packages/ui/src/store/documentWorkspace.ts` with the signature defined in `design.md`.
- [x] 2.2 Implement `.agent.json` path resolution for owner directories and read/patch/write through `IContextProvider.readDocument()` and `writeDocument()`.
- [x] 2.3 Preserve unsupported existing fields such as `name`, `description`, `skills`, `linkDir`, and unknown keys during save.
- [x] 2.4 Normalize blank editable fields by deleting `instructions`, `modelProviderName`, or `modelName`, normalize default `merge` by deleting `inheritance`, and normalize full tools inheritance by deleting `tools`.
- [x] 2.5 Refresh workspace context and resync the active Agent after saving.
- [x] 2.6 Add document workspace store tests for saving description, model, prompt, inheritance, preserving unknown fields, and refreshing the resolved Agent.
- [x] 2.7 Extend document workspace save logic so tools inheritance deletes owner `.agent.json.tools`, while explicit selection persists the selected tool list.
- [x] 2.8 Add document workspace store tests for defaulting tools from resolved `agent.tools`, read-only inherited tools display, explicit tool selection save, and tools inheritance removal.

## 3. AgentView UI

- [x] 3.1 Remove `conversations` prop, `open-conversation` emit, sorted conversation logic, and middle-pane conversation list markup from `AgentView`.
- [x] 3.2 Add editable fields for system prompt and inheritance mode to `AgentView`.
- [x] 3.3 Reuse `ProviderModelSelector` in `AgentView` for model provider/model editing.
- [x] 3.4 Add dirty state, save state, disabled state, and local save error display for the Agent editor.
- [x] 3.5 Emit `load-provider-models` when a provider's model catalog needs loading.
- [x] 3.6 Emit `save-agent-config` with only editable Agent fields when the user saves.
- [x] 3.7 Update English and Chinese i18n messages for Agent editing, inheritance modes, save actions, and errors.
- [x] 3.8 Update `AgentView.test.ts` for metadata rendering, no middle-pane document or conversation list, top collapsed prompt editing, description editing, model selection, inheritance selection, and save events.
- [x] 3.9 Add tools selector coverage for defaulting from resolved `agent.tools`, switching to read-only inheritance display, and saving explicit tool selections.
- [x] 3.10 Update AgentView copy and state handling so the tools inheritance switch uses read-only inherited display instead of a second editing surface.

## 4. Workspace Wiring

- [x] 4.1 Update `DocumentWorkspaceView.vue` to stop computing and passing AgentView conversations.
- [x] 4.2 Pass existing provider catalog and model loading state from `chatStore` to `AgentView`.
- [x] 4.3 Wire `AgentView` provider load requests to `chatStore.ensureProviderModelsLoaded(providerId)`.
- [x] 4.4 Wire `AgentView` save requests to `documentStore.saveAgentConfig({ ownerPath: selectedOwnerNode.path, patch })`.
- [x] 4.5 Keep right-side `AgentPane` behavior unchanged for owner directory selections, including agent-scoped conversation list visibility.
- [x] 4.6 Update `DocumentWorkspaceView.test.ts` to remove AgentView conversation-opening expectations and verify editor wiring.
- [x] 4.7 Wire tools state from the builtin tool catalog into `AgentView` and ensure the inherit switch disables tool editing while still showing the resolved tools list.

## 5. E2E Coverage

- [x] 5.1 Add a Playwright e2e scenario for opening an Agent owner directory, confirming the middle pane shows the Agent editor and no middle-pane conversation list.
- [x] 5.2 Add a Playwright e2e scenario for editing and saving the Agent prompt, then verifying refreshed metadata/effective prompt behavior.
- [x] 5.2a Add a Playwright e2e scenario for editing and saving the Agent description, then verifying refreshed metadata behavior.
- [x] 5.3 Add a Playwright e2e scenario for changing provider/model selection and verifying the saved `.agent.json` drives the active Agent model label.
- [x] 5.4 Add a Playwright e2e scenario for switching inheritance from merge to override and verifying inherited prompt/config is no longer shown in the resolved Agent.
- [x] 5.5 If extension e2e is touched, run it with elevated permission and Chromium channel as required for MV3 service workers.
- [x] 5.6 Add a Playwright e2e scenario for defaulting tools from the resolved `agent.tools`, toggling full inheritance into read-only mode, and saving an explicit tool selection.

## 6. Verification

- [x] 6.1 Run `openspec validate agent-view-editor --strict`.
- [x] 6.2 Run `pnpm lint`.
- [x] 6.3 Run `pnpm exec tsc --noEmit`.
- [x] 6.4 Run focused unit tests for core config resolution and UI workspace components.
- [x] 6.5 Run the new or updated Playwright e2e tests.
- [x] 6.7 Run `pnpm build`.
- [x] 6.8 If extension e2e passed during this change, run `pnpm --filter extension build`.

## 7. Knowledge Node History Navigation

- [x] 7.1 Add `nodeHistory` and `nodeHistoryIndex` to `packages/ui/src/store/documentWorkspace.ts`.
- [x] 7.2 Extend `openNode(path, options)` with `recordHistory?: boolean` and record distinct user-initiated node visits by default.
- [x] 7.3 Add `canGoBackNodeHistory` and `canGoForwardNodeHistory` getters.
- [x] 7.4 Add `goBackNodeHistory()` and `goForwardNodeHistory()` actions that open historical nodes without recording duplicate history entries.
- [x] 7.5 Ensure `restoreSelection()`, refresh/delete cleanup, and missing-node cases do not leave stale or duplicated history entries.
- [x] 7.6 Add back/forward toolbar controls to `DocumentFileTree.vue` with i18n labels and disabled state.
- [x] 7.7 Wire `DocumentWorkspaceView.vue` to the new history actions and call `syncWorkspaceConversationSelection()` after history navigation.
- [x] 7.8 Add unit/component tests for history recording, back/forward navigation, forward truncation, disabled buttons, and emitted events.
- [x] 7.9 Expose the same node history controls in the real application top bar through `AppTopBar.vue` and `WorkspaceHostApp.vue`.

## 8. Chat Scroll Behavior

- [x] 8.1 Add scroll helpers in `NormalChatView.vue` to detect whether the message list is near the bottom and to centralize bottom scrolling.
- [x] 8.2 Change rendered message watchers so asynchronous assistant updates do not auto-scroll when the user has scrolled upward.
- [x] 8.3 Change displayed conversation switching so the message list starts at the top by default while preview mode remains top-aligned.
- [x] 8.4 Keep active question synchronization working after message updates and scroll events.
- [x] 8.5 Add `NormalChatView.test.ts` coverage for preserving scroll position during asynchronous updates and top alignment on conversation switch.

## 9. Additional Verification For Node History And Scroll

- [x] 9.1 Run `openspec validate agent-view-editor --strict`.
- [x] 9.2 Run focused shared UI tests for `documentWorkspace`, `DocumentFileTree`, `DocumentWorkspaceView`, and `NormalChatView`.
- [x] 9.3 Run `pnpm --filter ui test`.
- [x] 9.4 Run lint/type/build checks required by the repository after implementation.
