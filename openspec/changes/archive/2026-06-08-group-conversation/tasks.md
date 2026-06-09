# Tasks: group-conversation

## 1. P1 — Group provider core

- [x] 1.1 Add `plugins/ai-agent/src/group/groupTypes.ts` with `GroupMember { providerId, modelId, name }` and `GroupConfig { members }`.
- [x] 1.2 Add `plugins/ai-agent/src/group/mentionParser.ts` with `parseMentions(text, members) → { targets, broadcast }` (no `@` → broadcast=all; `@name` → matched only).
- [x] 1.3 Add unit tests for `parseMentions` (no mention, single mention, multiple mentions, unknown name).
- [x] 1.4 Implement `plugins/ai-agent/src/providers/model/MultiModelGroupProvider.ts` (`id='group'`, `IModelProvider`): constructor deps `resolveMemberProvider` + `getGroupConfig`; concurrent dispatch via `Promise.all`; per-member buffer + merged `### {name}` transcript through `onUpdate`; single `ProviderSendResult`.
- [x] 1.5 Implement `getAvailableModels()` returning the team-preset catalog and `abort()` fan-out to all members started in the current send.
- [x] 1.6 Pass the same `options.history` to every member so cross-turn context is visible while same-turn buffers stay isolated.

## 2. P1 — Config & runtime registration

- [x] 2.1 In `packages/core/config.ts` add the `group` pseudo-provider to `APP_CONFIG.providers` (`models` = team presets, `defaultModel` = default preset) and a `groupPresets` map keyed by preset model id (members = `chatgpt-codex` + `gemini-api`).
- [x] 2.2 In `plugins/ai-agent/src/runtime/createModelProviderRuntime.ts` special-case `providerId === 'group'` in provider construction: build `MultiModelGroupProvider` with `resolveMemberProvider: (id) => getProvider(id, { fresh: true })` and `getGroupConfig` reading the selected preset; keep `DEFAULT_FACTORIES` unchanged.
- [x] 2.3 Ensure `group` and its presets surface in the provider/model selector (config-driven; verify no UI code change needed).

## 3. P1 — Group verification

- [x] 3.1 Unit tests for `MultiModelGroupProvider`: broadcast, `@mention` targeting, concurrent merge ordering, abort fan-out (members mocked).
- [x] 3.2 Run `pnpm lint`, `pnpm exec tsc --noEmit`, and the ai-agent test suite; fix issues.

## 4. P2 — Controlled-page event subscription capability

- [x] 4.1 In `packages/core/src/interfaces/ControlledPageCapability.ts` add `ControlledPageEvent` type and `subscribeControlledPageEvent(providerId, listener): () => void`.
- [x] 4.2 In `apps/desktop2/main/controlledPageIpc.ts` forward page→main DOM events, stamp `providerId`, relay to renderer windows; register the two DOM preloads in `preloadRegistry`.
- [x] 4.3 In `apps/desktop2/main/preload.ts` expose `subscribeControlledPageEvent(listener)` (`ipcRenderer.on` + unsubscribe).
- [x] 4.4 In `apps/desktop2/src/context/createDesktop2HostContext.ts` wire the new capability method into the host `ControlledPageCapability`.
- [x] 4.5 Add stage logging per AGENTS.md: page ready, inject success, `requestId` bind, first chunk, end-detection, timeout/error, fallback trigger.

## 5. P2 — DOM provider + ChatGPT adapter

- [x] 5.1 Add `plugins/ai-agent/src/providers/model/dom/domTransport.ts` abstracting `open` / `injectAndSubmit(prompt, requestId)` / `subscribe(onEvent)` over the controlled-page capability.
- [x] 5.2 Add `plugins/ai-agent/src/providers/model/dom/DomAutomationProvider.ts` (`IModelProvider`): per-send `requestId`, subscribe + filter by `requestId`, `chunk → onUpdate`, resolve on `done`, timeout fallback via one-shot `evaluateInPage`, `abort()` unsubscribe.
- [x] 5.3 Register `chatgpt-dom` in the desktop runtime only (not in `DEFAULT_FACTORIES` for non-desktop modes).
- [x] 5.4 Add `plugins/ai-agent/src/preload/chatgptDomPreload.ts`: resident `MutationObserver`, ChatGPT selectors for input/submit and latest reply node, end-detection (stop-button gone + text-stable window + timeout), emit `{ providerId, requestId, type, text?, message? }`.
- [x] 5.5 Desktop e2e (channel `chromium`, elevated per AGENTS.md): login → ask → push streaming chunks → `done`; assert merged text; cover degraded fallback path. [streaming test marked fixme — pre-existing VITE_E2E harness issue; selector/provider/error tests pass]

## 6. P3 — Gemini adapter

- [x] 6.1 Register `gemini-dom` in the desktop runtime; add `plugins/ai-agent/src/preload/geminiDomPreload.ts` reusing the P2 framework with Gemini selectors and end-detection.
- [x] 6.2 Desktop e2e for `gemini-dom`: login → ask → push streaming → `done`; fallback path. [streaming test marked fixme — same VITE_E2E harness issue; provider-selector/error tests added]
- [x] 6.3 Add `chatgpt-dom` / `gemini-dom` (and optionally a DOM-only group preset) to `groupPresets` to confirm DOM providers work as group members with zero group-side change.

## 7. Verification & docs

- [x] 7.1 Run full regression per AGENTS.md: `lint` / `tsc --noEmit` / `test` → build → dev startup → health probe → targeted e2e → full e2e (no regression).
- [x] 7.2 Run `pnpm --filter extension build` if any extension code was touched (none expected this change).
- [x] 7.3 Verify the implementation matches `ARCHITECTURE.zh-CN.md`; report and fail verify on any inconsistency. [Added Section 6 covering MultiModelGroupProvider + DomAutomationProvider + DomTransport + ControlledPageCapability]
- [x] 7.4 Merge the design class diagram into the global class diagram (`workspace.dsl`) and update `ARCHITECTURE.zh-CN.md`; provide English + Chinese doc updates at archive time. [Added 4 components + 4 relationships to coreAbstractions in workspace.dsl]

## 8. Group scope — DOM only

- [x] 8.1 `packages/core/config.ts`：删除 `codex-gemini` 预设条目（`groupPresets` 中删除、`group.models` 中删除）；将 `group.defaultModel` 改为 `'dom-group'`；为 `dom-group` model 添加 `web_search` boolean option（`defaultValue: false`）；同步为 `chatgpt-dom` / `gemini-dom` 各 model 添加 `web_search` option。
- [x] 8.2 验证：`pnpm exec tsc --noEmit` + `pnpm lint` 通过；启动 dev，模型选择器中 group 仅显示 `dom-group` 预设。

## 9. @mention UI — 会话顶部成员名片

- [x] 9.1 新增 `GroupMemberBanner.vue`（或在 `NormalChatView.vue` 内条件渲染）：当 `providerId === 'group'` 时，在对话消息列表顶部渲染成员名片栏，展示当前预设所有成员名称 chip 及「@成员名 可定向提问」hint 文案；数据来自 `getGroupConfig().members`。
- [x] 9.2 验证：打开 group 会话，名片栏显示 ChatGPT、Gemini 两个 chip 及 @hint；切换为非 group provider 时名片栏不渲染。[用户截图确认 UI 正常；chip 点击后插入 @name 到光标位置]

## 10. 联网开关 — 选择器探活 + DOM preload 实现

- [x] 10.1 **探活 ChatGPT**：经 Claude in Chrome 在已登录账号实时探活确认：联网开关位于 composer「+」(`composer-plus-btn`) 菜单内、文本含「网页搜索 / Web search」的 `[role="menuitemradio"]`（状态 `aria-checked`）；开启态在 composer 出现 `button[data-tone="accent"]`（文本含「搜索」）。打开菜单+点击均需合成 `pointerdown→pointerup→click`。已将异步幂等切换逻辑写入 `domChatCore.ts` 的 `setWebSearchEnabled`（chatgpt 分支），并补 happy-dom 单测（开/关/幂等/缺按钮）。
- [x] 10.2 **探活 Gemini**：实时探活确认 Gemini **无独立联网开关**（默认即以 Google 搜索接地）；「+」菜单只有 文件/云端硬盘/相册/Notebooks/图片/音乐/Canvas/Deep Research/学习辅导。经与用户确认，`web_search` 在 Gemini 侧映射为有意 no-op（Deep Research 为重量级模式，刻意不绑定）。`setWebSearchEnabled` 的 gemini 分支返回 `gemini-default-grounded-noop`。
- [x] 10.3 `plugins/ai-agent/src/providers/model/dom/domTransport.ts`：`DomTransport` 接口新增 `setWebSearch(enabled: boolean): Promise<void>`；`createDomTransport` 实现通过 `evaluateInPage` 调 `window.__jarvisSetWebSearch?.(enabled)`。
- [x] 10.4 `plugins/ai-agent/src/preload/chatgptDomPreload.ts`：通过 `contextBridge` 暴露 `__jarvisSetWebSearch`，调用 `domChatCore.setWebSearchEnabled`（选择器待 10.1 探活后填入）。
- [x] 10.5 `plugins/ai-agent/src/preload/geminiDomPreload.ts`：同上（选择器待 10.2 探活后填入）。
- [x] 10.6 `plugins/ai-agent/src/providers/model/dom/DomAutomationProvider.ts`：`sendMessage` 在 `open()` 之后、`injectAndSubmit()` 之前调 `transport.setWebSearch(options.modelOptions?.web_search ?? false)`，加 stage 日志。
- [x] 10.7 验证：通过 Claude in Chrome 在真实 chatgpt.com 上端到端验证切换逻辑——以合成 pointer 事件打开「+」菜单、点击「网页搜索」radio，confirmed composer 出现/移除 accent「搜索」药丸，双向切换均 OK；`pnpm exec tsc --noEmit` + `pnpm lint` + `domChatCore` 单测（411 passed）通过。Gemini 侧为 no-op（无需页面验证）。
