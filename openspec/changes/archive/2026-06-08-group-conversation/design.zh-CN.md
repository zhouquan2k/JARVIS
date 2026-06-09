> **语言**: [English](design.md) | 中文

## Context

JARVIS 所有会话发送都收敛到单一契约 `IModelProvider.sendMessage(prompt, options, onUpdate) => ProviderSendResult`（[IModelProvider.ts](../../../plugins/ai-agent/src/interfaces/IModelProvider.ts)）。provider 由 `createModelProviderRuntime.getProvider(providerId, { fresh? })` 从模块级 `DEFAULT_FACTORIES` 懒构造（[createModelProviderRuntime.ts](../../../plugins/ai-agent/src/runtime/createModelProviderRuntime.ts)），目录来自 `APP_CONFIG.providers`（[config.ts](../../../packages/core/config.ts)）。desktop 已通过 `controlled-page` 能力（`openControlledPage` / `evaluateInPage`，[controlledPageManager.ts](../../../apps/desktop2/main/controlledPageManager.ts)）为每个 provider 运行一个隐藏、带会话分区的 `BrowserWindow`，并已有 per-provider preload 注册表（Gemini DOM 历史 provider 在用）。

两个特性均借鉴自 [openteam](https://github.com/afumu/openteam)，都针对该接缝设计，不触碰发送主链路 / store / 持久化 / 模型选择 UI：
1. **群聊会话**——一个 `group` provider，编排多个成员 provider。
2. **DOM 自动化 provider**——仅 desktop，直接驱动真实 ChatGPT/Gemini 页面，而非逆向其 HTTP 后端（`ChatGPTWebProvider` 走的路）。

二者正交且可组合：DOM provider 落地后，其 `chatgpt-dom`/`gemini-dom` 可直接进群预设，Group 侧零改动。

## Goals / Non-Goals

**Goals：**
- 两个新 provider 都是普通 `IModelProvider`；store / 持久化 / 模型选择 / `sendTarget.provider.sendMessage` 不变。
- Group 分发与 provider 无关：成员经 `resolveMemberProvider(id) → runtime.getProvider(id, { fresh: true })` 解析，无 provider 分支。
- DOM provider 以 push 方式（常驻 `MutationObserver` → 页→主→渲染）流式回传，而非轮询，并带轮询降级兜底。
- 注册不进模块级 `DEFAULT_FACTORIES`：group 为 runtime 特判；DOM provider 仅在 desktop runtime 注册。

**Non-Goals：**
- group 不做轮次调度 / auto-plan / persona 模板（仅广播 + `@mention`）。
- MVP 不做每成员独立气泡（合并单条 assistant transcript）；未来 `GroupWorkflowController` 可复用编排核心。
- 本期不做 web/extension 的 DOM provider（web 受 `X-Frame-Options`/CSP 阻断；extension 不在范围）。
- 不改现有 `chatgpt-web` HTTP 逆向 provider。

## Decisions

### Decision 1：`MultiModelGroupProvider` 实现 `IModelProvider`，并发编排成员
- **新增** `plugins/ai-agent/src/group/groupTypes.ts`：
  - `export interface GroupMember { providerId: string; modelId: string; name: string }`
  - `export interface GroupConfig { members: GroupMember[] }`
- **新增** `plugins/ai-agent/src/group/mentionParser.ts`：
  - `export function parseMentions(text: string, members: GroupMember[]): { targets: GroupMember[]; broadcast: boolean }` —— 无 `@name` 命中时 `broadcast=true`、`targets=全部成员`；否则 `targets`=命中成员。
- **新增** `plugins/ai-agent/src/providers/model/MultiModelGroupProvider.ts`，实现 `IModelProvider`，`id='group'`。构造依赖（runtime 注入）：
  - `resolveMemberProvider(providerId: string): IModelProvider`
  - `getGroupConfig(): GroupConfig`
  - `sendMessage(prompt, options, onUpdate)`：
    1. `const { members } = getGroupConfig()`；`const { targets } = parseMentions(prompt, members)`。
    2. `Promise.all(targets.map(m => resolveMemberProvider(m.providerId).sendMessage(prompt, { ...options, modelId: m.modelId, history }, chunk => writeSegment(m.name, chunk.text))))`。
    3. `writeSegment` 写入按成员的缓冲；每次回调 `onUpdate({ text: mergeTranscript() })`，merge 按成员顺序渲染 `### {name}\n{text}` 分段。
    4. 解析为单条 `ProviderSendResult`，`text` 为最终合并 transcript。
  - `abort()`：透传到本轮启动的全部成员实例（per-send 数组记录）。
  - `getAvailableModels()`：返回 config 中的团队预设目录（预设即 group 的「models」）。
  - **跨轮可见**天然成立：store 已通过 `options.history` 传入历史消息；每个成员收到同一 `history`，即可见上一轮合并 transcript。同轮隔离天然成立（成员并发、缓冲本地）。
- **备选方案：** 在 provider 契约之外做专门的 `GroupWorkflowController`（类似 compare workflow）。MVP 否决，因需改 store/UI；provider 契约方案保持主链路不动。编排核心做了抽离，后续 controller 可复用。

### Decision 2：group 以 config 伪 provider + runtime 特判注册；本期仅支持 DOM 成员
- **修改** `packages/core/config.ts`：在 `APP_CONFIG.providers` 增加 `{ id: 'group', label, models: [{ id: 'dom-group', name: 'ChatGPT + Gemini (DOM)', options: [web_search] }], defaultModel: 'dom-group' }`。删除 `codex-gemini` 预设（API 模式不在本期范围）。`groupPresets` 只保留 `dom-group` 条目，成员 = `chatgpt-dom` + `gemini-dom`。
- **修改** `plugins/ai-agent/src/runtime/createModelProviderRuntime.ts`：在 `createProviderInstance`（或 `getProvider` 内守卫）对 `providerId === 'group'` 特判，构造 `new MultiModelGroupProvider({ resolveMemberProvider: (id) => this.getProvider(id, { fresh: true }), getGroupConfig: () => readPresetFromConfig(currentPresetModelId) })`。使模块级 `DEFAULT_FACTORIES` 不引入 group/`this` 绑定依赖。
- **理由：** group 需要 `runtime.getProvider`（实例方法）与当前所选预设，二者静态工厂都无法干净提供；显式特判是最小诚实接缝。

### Decision 3：`DomAutomationProvider` 是基于 `controlled-page` transport 的薄 `IModelProvider`
- **新增** `plugins/ai-agent/src/providers/model/dom/domTransport.ts`：
  - `export interface DomTransport { open(input): Promise<void>; injectAndSubmit(prompt, requestId): Promise<void>; subscribe(onEvent): () => void }`，构建于 `ControlledPageCapability`（`openControlledPage` / `evaluateInPage` / `subscribeControlledPageEvent`）。此处无站点知识。
- **新增** `plugins/ai-agent/src/providers/model/dom/DomAutomationProvider.ts`，实现 `IModelProvider`（以 `chatgpt-dom` / `gemini-dom` 两个 id 构造，各注入 `targetUrl`）：
  - `sendMessage(prompt, options, onUpdate)`：生成 `requestId`；`transport.open()`；`const off = transport.subscribe(ev => { if (ev.requestId !== requestId) return; if (ev.type==='chunk') onUpdate({ text: ev.text }); ... })`；`transport.injectAndSubmit(prompt, requestId)`；等待 `done`/`error`（或超时）；超时则**降级**用一次性 `evaluateInPage` 读取最终文本；`off()`；返回 `ProviderSendResult`。
  - `abort()`：取消订阅 + 尽力停止。
- **理由：** 站点选择器/注入留在 desktop DOM preload，使 provider 保持平台无关的 `IModelProvider`，从而也可作为 group 成员。

### Decision 4：受控页事件订阅（push）—— 扩展能力 + desktop 接线
- **修改** `packages/core/src/interfaces/ControlledPageCapability.ts`：新增
  - `subscribeControlledPageEvent(providerId: string, listener: (event: ControlledPageEvent) => void): () => void`
  - `export interface ControlledPageEvent { providerId: string; requestId: string; type: 'chunk' | 'done' | 'error'; text?: string; message?: string }`
- **新增** `apps/desktop2/main/preload/chatgptDomPreload.ts` 与 `geminiDomPreload.ts`：常驻 `MutationObserver` 观察最新助手回复节点；站点适配器封装 `targetUrl`、`injectAndSubmit(prompt, requestId)` 选择器、回复节点定位、结束判定（停止按钮消失 + 文本稳定窗口 + 超时）。经 `ipcRenderer.send(channel, payload)` 上报。移植 openteam 的 `responseContainers` / `replyObserver` / `replyTracker` / `replyTimeout` / `replyCompensation` / `reportableReply`，将 `chrome.runtime` 换为 Electron IPC。
- **修改** `apps/desktop2/main/controlledPageIpc.ts`：将两个 preload 注册到 `preloadRegistry`；转发页→主事件，打上 `providerId`，经 `webContents.send` 转发到渲染窗口（沿用现有 `console-message` 单向转发与 `emitToRendererWindows` 登录模式）。
- **修改** `apps/desktop2/main/preload.ts`：暴露 `subscribeControlledPageEvent(listener)`（`ipcRenderer.on` + 返回取消订阅），仿 `onProviderLoginCompleted`。
- **修改** `apps/desktop2/src/context/createDesktop2HostContext.ts`：将新能力方法接入 host `ControlledPageCapability`。
- **可观测性**（按 AGENTS.md 跨进程/DOM/时序要求）：每跳打日志——受控页就绪、注入成功、`requestId` 绑定、首个 chunk、结束判定、超时/异常、降级触发。

### Decision 5：@mention UI — 会话顶部成员名片

- **新增** group 会话顶部一个轻量「成员名片栏」（banner），展示当前预设的所有成员（名称 chip），并附 `@成员名 可定向提问` 的 hint 文案。
- **数据来源**：从 `getGroupConfig()` 读取当前预设的 `members` 列表；名片栏只在 `group` provider 的会话中渲染（通过 `providerId === 'group'` 判断）。
- **位置**：对话消息列表顶部（不影响输入区）；实现为 `NormalChatView.vue` 内的条件渲染块，或抽为独立 `GroupMemberBanner.vue` 组件。
- **交互**：名片仅展示，不可点击（MVP）；后续可做点击自动插入 `@name` 的增强。
- **理由**：`mentionParser` 已完整，唯一缺口是用户不知道成员名字；名片栏是零依赖的最小方案，无需改 store/输入区契约。

### Decision 6：联网开关 — modelOptions 透传 + DOM preload 切换

整个链路分三段：

```
group/dom model option (web_search: boolean)
  ↓ SendMessageOptions.modelOptions 透传（MultiModelGroupProvider 已做 { ...options }，无需改）
DomAutomationProvider.sendMessage
  ↓ transport.setWebSearch(enabled) — 在 open() 之后、injectAndSubmit() 之前
DomTransport.setWebSearch(enabled)
  ↓ evaluateInPage: window.__jarvisSetWebSearch(enabled)
DOM preload (chatgpt/gemini)
  ↓ 找联网开关按钮，按需点击
页面 DOM
```

- **`DomTransport` 接口**（`domTransport.ts`）：新增 `setWebSearch(enabled: boolean): Promise<void>`；实现通过 `evaluateInPage` 调 `window.__jarvisSetWebSearch(enabled)`，不传 `targetUrl`（不触发导航）。
- **`DomAutomationProvider`**：`sendMessage` 在 `transport.open()` 后调 `transport.setWebSearch(options.modelOptions?.web_search ?? false)`，保证每次发送前状态与 option 对齐（幂等，无状态残留）。
- **DOM preload**（`chatgptDomPreload.ts` / `geminiDomPreload.ts`）：实现 `window.__jarvisSetWebSearch(enabled: boolean)`，读取当前联网按钮状态，若与目标不符则点击切换。选择器须先**探活**（见 Task 10.1/10.2），再硬编码到 preload。
- **config**：`chatgpt-dom`、`gemini-dom`、`dom-group` 三个 model 配置均加 `web_search` boolean option（`defaultValue: false`）。
- **MultiModelGroupProvider 透传**：已通过 `{ ...options, modelId: member.modelId }` 透传 `modelOptions`，无需改动。

**不采用**「检测当前状态再决定是否点击」的方案，而是「每次 send 前强制对齐」——DOM 操作幂等，避免上一轮残留状态污染。

## Risks / Trade-offs

- **选择器脆性**（站点改版即失效）→ 每站适配器 + 真实链路 desktop e2e（不 mock 站点）；轮询降级避免硬卡死。
- **结束判定不可靠**（无稳定「停止生成」信号）→ 停止按钮消失 + 文本稳定窗口 + 超时三者结合；降级重读。
- **`requestId` 串话**（上一轮残留推送）→ provider 按 `requestId` 过滤每个事件；preload 从 `injectAndSubmit` 打标。
- **group abort 不完全**（部分成员忽略 abort）→ per-send 记录已启动实例并逐个 `abort()`；合并 transcript 仍以缓冲文本解析。
- **group 实例/缓存冲突**（成员经 `getProvider(id, { fresh: true })`）→ 用 fresh 实例，避免群运行干扰单选用的单例缓存。
- **DOM provider 仅 desktop**（web/extension 无法注入）→ 产品接受此限制；openteam 共享选择器降低维护成本。
- **架构文档漂移** → 归档步骤须把设计类图合并进 `workspace.dsl` 并更新 `ARCHITECTURE.zh-CN.md`；verify 检查一致性。

## Migration Plan

分阶段、单一 change（归档前按 AGENTS.md 跑完整 e2e）：
- **P1**：`MultiModelGroupProvider` + `group/` + config 预设 + runtime 特判（成员=`chatgpt-codex` + `gemini-api`）。以单测（广播 / `@mention` / 并发合并 / abort 透传）+ `tsc --noEmit` + `lint` 验证。
- **P2**：扩展 `ControlledPageCapability` + desktop 页→主→渲染事件链 + `DomAutomationProvider` + ChatGPT DOM preload/适配器。以 desktop e2e（登录 → 提问 → push 流式 → 结束态；降级路径）验证。
- **P3**：Gemini DOM preload/适配器，复用 P2 框架。e2e 形态相同。

回滚：group 伪 provider 与 DOM provider id 在 config/runtime 中均为增量；移除 config 条目与 runtime 特判即可完全禁用，不影响现有 provider。

## Open Questions

- 团队预设 config 的最终形态（`groupPresets` 常量 vs 内联到每个 `group` model 条目）—— 默认采用按预设 model id 索引的 `groupPresets` map。
- group 的 `generateConversationTitle` 是委派给首个成员还是跳过（MVP：跳过 / 用通用标题）。
- 各站结束判定阈值（文本稳定窗口 / 超时）—— P2/P3 e2e 期间调优。
