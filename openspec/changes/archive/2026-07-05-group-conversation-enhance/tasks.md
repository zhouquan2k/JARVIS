## 1. Data Model — Type Definitions

- [x] 1.1 Add `GroupMemberStatus` and `GroupSummaryPhase` union types to `plugins/ai-agent/src/interfaces/Conversation.ts`
- [x] 1.2 Add `GroupMemberPart` interface to `plugins/ai-agent/src/interfaces/Conversation.ts`
- [x] 1.3 Add `GroupSummaryPart` interface to `plugins/ai-agent/src/interfaces/Conversation.ts`
- [x] 1.4 Add optional `groupMembers?: GroupMemberPart[]` and `groupSummary?: GroupSummaryPart` fields to `ConversationMessage`
- [x] 1.5 Add optional `groupMembers?` and `groupSummary?` fields to `ProviderStreamUpdate` in `plugins/ai-agent/src/interfaces/IModelProvider.ts`
- [x] 1.6 Add optional `groupMembers?` and `groupSummary?` fields to `ProviderSendResult` in `plugins/ai-agent/src/interfaces/IModelProvider.ts`

## 2. Config — Summarizer Preset Config

- [x] 2.1 Add `GroupSummarizerConfig` interface to `packages/core/config.ts`
- [x] 2.2 Add `groupSummarizers: Record<string, GroupSummarizerConfig>` field to `APP_CONFIG` type and value in `packages/core/config.ts`
- [x] 2.3 Populate initial `groupSummarizers` entry for existing `'dom'` preset (use an API-backed provider, e.g. `gemini-api`)

## 3. Group Provider — Summarizer Logic

- [x] 3.1 Create `plugins/ai-agent/src/group/groupSummaryPrompt.ts` — export `composeGroupSummaryPrompt(members: GroupMemberPart[], systemPrompt?: string): string` with consensus/complementary/conflicts + `@MemberName` attribution instruction
- [x] 3.2 Extend `MultiModelGroupProviderDeps` in `plugins/ai-agent/src/group/groupTypes.ts` with `resolveSummarizer(presetModelId?: string): IModelProvider | null` and `getSummarizerConfig(presetModelId?: string): GroupSummarizerConfig | null`
- [x] 3.3 Refactor `MultiModelGroupProvider.sendMessage` to build `GroupMemberPart[]` buffer instead of plain string buffers; emit `groupMembers` in each `onUpdate` call alongside `text`
- [x] 3.4 After `Promise.all(memberTasks)`: if members ≥ 2 and summarizer is configured, invoke summarizer provider; stream result into `groupSummary`; propagate final `groupSummary` in `ProviderSendResult`
- [x] 3.5 Guard: skip summarizer if `resolveSummarizer` returns null or if resolved provider is a DOM provider
- [x] 3.6 Extend `abort()` to cancel active summarizer provider (track in `activeSummarizerProvider`)
- [x] 3.7 Update `createModelProviderRuntime.ts`: inject `resolveSummarizer` and `getSummarizerConfig` into `MultiModelGroupProvider`; update `getGroupConfig` return type to include summarizer

## 4. Chat Store — Write groupMembers/groupSummary

- [x] 4.1 Update `onUpdate` handler in `plugins/ai-agent/src/store/chat.ts` (~line 3080–3090): write `update.groupMembers` and `update.groupSummary` to `lastMsg` alongside `content`
- [x] 4.2 Update final result write (~line 3165–3169): write `result.groupMembers` and `result.groupSummary` to `lastMsg`

## 5. UI — GroupMessageTabs Component

- [x] 5.1 Create `plugins/ai-agent/src/components/GroupMessageTabs.vue` with props `groupMembers: GroupMemberPart[]` and `groupSummary?: GroupSummaryPart`
- [x] 5.2 Implement Tab header: `Summary` tab + one tab per member; each label shows member name + status dot (streaming/done/error)
- [x] 5.3 Implement default tab logic: mount on first member; watch `groupSummary.phase` — when `'done'` and `userHasSwitched === false`, set `activeTab = 'summary'`
- [x] 5.4 Implement Summary tab content: progress view while `phase !== 'done'`; structured Markdown when `'done'`
- [x] 5.5 Implement `@MemberName` chip rendering in Summary tab: parse tokens, render as clickable chips that call `activeTab = memberName`
- [x] 5.6 Implement plain-Markdown fallback for Summary tab when no `@` chips found
- [x] 5.7 Implement member tab content: render `groupMembers[i].content` via `MarkdownContent`; show error message when `status === 'error'`

## 6. UI — NormalChatView Integration

- [x] 6.1 In `plugins/ai-agent/src/views/NormalChatView.vue` message render loop: add `v-if="message.groupMembers && message.groupMembers.length > 1"` → render `GroupMessageTabs`; single-member (`length === 1`) → plain `MarkdownContent` with `groupMembers[0].content`; no `groupMembers` → existing `MarkdownContent` with `content`

## 7. UI — Panel ↔ Full-Screen Toggle Symmetry

- [x] 7.1 Add "collapse to panel" button in `plugins/ai-agent/src/views/NormalChatView.vue` chat header area; emit `request-workspace-switch` with path `'/'`
- [x] 7.2 Verify `AgentConversationPanel` expand button icon/tooltip is visually paired with the new collapse button; update if inconsistent

## 8. UI — Document Follow-on (WorkspaceHostApp)

- [x] 8.1 In `packages/ui/src/views/WorkspaceHostApp.vue`: add `watch` on `chatStore.currentConversation`
- [x] 8.2 On conversation change: resolve `documentIds?.[0]` to document path; guard against re-opening already-active document; call `documentWorkspace.openNode(path)` when valid
- [x] 8.3 Handle not-found case silently (no error thrown or surfaced)

## 9. Bilingual Docs — English + Chinese

- [x] 9.1 Create `openspec/changes/group-conversation-enhance/proposal.zh-CN.md` (Chinese translation of `proposal.md`)
- [x] 9.2 Create `openspec/changes/group-conversation-enhance/design.zh-CN.md` (Chinese translation of `design.md`)
- [x] 9.3 Create `openspec/changes/group-conversation-enhance/specs/group-message-tabs/spec.zh-CN.md`
- [x] 9.4 Create `openspec/changes/group-conversation-enhance/specs/group-summarizer/spec.zh-CN.md`
- [x] 9.5 Create `openspec/changes/group-conversation-enhance/specs/conversation-context-follow/spec.zh-CN.md`
- [x] 9.6 Create `openspec/changes/group-conversation-enhance/specs/core-interfaces/spec.zh-CN.md`
- [x] 9.7 Create `openspec/changes/group-conversation-enhance/specs/static-config/spec.zh-CN.md`

## 10. Lint, Type-check, Build

- [x] 10.1 Run `pnpm lint` — fix any lint errors
- [x] 10.2 Run `pnpm exec tsc --noEmit` — fix any type errors
- [x] 10.3 Run `pnpm build` (or `pnpm --filter <pkg> build` for affected packages)

## 11. E2E Tests — Group Message Tabs

- [x] 11.1 Create `apps/web2/tests/e2e/group-message-tabs.spec.ts` using Playwright
- [x] 11.2 Test: multi-member group turn renders tabbed card with Summary + member tabs (test.fixme — requires live AI)
- [x] 11.3 Test: during streaming, default tab is first member; Summary tab shows progress (test.fixme — requires live AI)
- [x] 11.4 Test: user manually switches tab during streaming — Summary tab switch does NOT happen on completion (test.fixme — requires live AI)
- [x] 11.5 Test: user does NOT switch tab during streaming — auto-switches to Summary on completion (test.fixme — requires live AI)
- [x] 11.6 Test: clicking `@MemberName` chip in Summary tab switches to that member's tab (test.fixme — requires live AI)
- [x] 11.7 Test: single-member turn renders plain bubble (no tabs) (test.fixme — requires live AI)
- [x] 11.8 Test: legacy message without `groupMembers` renders without errors

## 12. E2E Tests — Summarizer Behavior

- [x] 12.1 Test: after all members complete (≥2), Summary tab transitions from progress view to structured content (test.fixme — requires live AI)
- [x] 12.2 Test: member failure — failed tab shows error; Summary tab still generates for successful members (test.fixme — requires live AI)
- [x] 12.3 Test: abort during summarization — Summary tab shows error state (test.fixme — requires live AI)

## 13. E2E Tests — Panel ↔ Full-Screen + Document Follow

- [x] 13.1 Test: expand button in panel navigates to full-screen (`/chat`) with same active conversation
- [x] 13.2 Test: collapse button in full-screen navigates back to workspace (`/`) with same conversation
- [x] 13.3 Test: switching to a conversation with `documentIds` auto-opens the first document
- [x] 13.4 Test: switching to a conversation with no `documentIds` leaves document area unchanged
- [x] 13.5 Test: switching to a conversation whose associated document does not exist — no error, document area unchanged

## 14. Full Regression

- [x] 14.1 Run `pnpm exec playwright test` — verify no regressions in existing e2e suite
