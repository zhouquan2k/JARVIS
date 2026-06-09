> **Language**: English | [中文](design.zh-CN.md)

## Context

JARVIS routes every conversation send through one `IModelProvider.sendMessage(prompt, options, onUpdate) => ProviderSendResult` ([IModelProvider.ts](../../../plugins/ai-agent/src/interfaces/IModelProvider.ts)). Providers are constructed lazily by `createModelProviderRuntime.getProvider(providerId, { fresh? })` from a module-level `DEFAULT_FACTORIES` map ([createModelProviderRuntime.ts](../../../plugins/ai-agent/src/runtime/createModelProviderRuntime.ts)), and the catalog comes from `APP_CONFIG.providers` ([config.ts](../../../packages/core/config.ts)). Desktop already runs each provider in its own hidden, persisted `BrowserWindow` via the `controlled-page` capability (`openControlledPage` / `evaluateInPage`, [controlledPageManager.ts](../../../apps/desktop2/main/controlledPageManager.ts)) with a per-provider preload registry that the Gemini DOM history provider already uses.

Two features, both borrowed from [openteam](https://github.com/afumu/openteam), are designed against this seam without touching the send main-path, store, persistence, or model-selector UI:
1. **Group conversation** — a `group` provider that orchestrates several member providers.
2. **DOM-automation provider** — a desktop-only provider that drives the real ChatGPT/Gemini pages instead of reverse-engineering their HTTP backends (the path `ChatGPTWebProvider` takes).

The two are orthogonal and composable: once the DOM provider lands, its `chatgpt-dom`/`gemini-dom` ids can appear in a group preset with zero group-side change.

## Goals / Non-Goals

**Goals:**
- Both new providers are plain `IModelProvider`s; store / persistence / model-selector / `sendTarget.provider.sendMessage` are unchanged.
- Group dispatch is provider-agnostic: members resolved via `resolveMemberProvider(id) → runtime.getProvider(id, { fresh: true })`, no per-provider branching.
- DOM provider streams replies via push (resident `MutationObserver` → page→main→renderer) rather than polling, with a polling fallback for resilience.
- Registration stays out of module-level `DEFAULT_FACTORIES`: group is a runtime special-case; DOM providers register only in the desktop runtime.

**Non-Goals:**
- No turn scheduling / auto-plan / persona templates for the group (broadcast + `@mention` only).
- No per-member independent message bubbles in MVP (merged single assistant transcript); a future `GroupWorkflowController` can reuse the orchestration core.
- No web/extension DOM provider this round (web blocked by `X-Frame-Options`/CSP; extension out of scope).
- No change to the existing `chatgpt-web` HTTP-reverse provider.

## Decisions

### Decision 1: `MultiModelGroupProvider` implements `IModelProvider`, orchestrating members concurrently
- **New** `plugins/ai-agent/src/group/groupTypes.ts`:
  - `export interface GroupMember { providerId: string; modelId: string; name: string }`
  - `export interface GroupConfig { members: GroupMember[] }`
- **New** `plugins/ai-agent/src/group/mentionParser.ts`:
  - `export function parseMentions(text: string, members: GroupMember[]): { targets: GroupMember[]; broadcast: boolean }` — when no `@name` matches, `broadcast=true` and `targets=all members`; otherwise `targets` = matched members.
- **New** `plugins/ai-agent/src/providers/model/MultiModelGroupProvider.ts` implementing `IModelProvider` with `id='group'`. Constructor deps (injected by runtime):
  - `resolveMemberProvider(providerId: string): IModelProvider`
  - `getGroupConfig(): GroupConfig`
  - `sendMessage(prompt, options, onUpdate)`:
    1. `const { members } = getGroupConfig()`; `const { targets } = parseMentions(prompt, members)`.
    2. Run `Promise.all(targets.map(m => resolveMemberProvider(m.providerId).sendMessage(prompt, { ...options, modelId: m.modelId, history }, chunk => writeSegment(m.name, chunk.text))))`.
    3. `writeSegment` updates a per-member buffer; each call emits `onUpdate({ text: mergeTranscript() })` where merge renders `### {name}\n{text}` segments in member order.
    4. Resolve a single `ProviderSendResult` whose `text` is the final merged transcript.
  - `abort()`: fan out to every member provider instance started this turn (track them in a per-send array).
  - `getAvailableModels()`: returns the team-preset catalog from config (presets are the group's "models").
  - **Cross-turn visibility** comes free: the store already passes prior assistant/user messages via `options.history`; each member receives the same `history`, so it sees the previous turn's merged transcript. Same-turn isolation is inherent (members run concurrently, buffers are local).
- **Alternative considered:** a dedicated `GroupWorkflowController` outside the provider contract (like the compare workflow). Rejected for MVP because it would require store/UI changes; the provider-contract approach keeps the main-path untouched. The orchestration core is factored so a controller can reuse it later.

### Decision 2: Register the group as a config pseudo-provider + a runtime special-case
- **Change** `packages/core/config.ts`: add to `APP_CONFIG.providers` an entry `{ id: 'group', label, models: <team presets>, defaultModel: <preset id> }`. Each "model" entry is a team preset; the preset → member list mapping lives in config (e.g. a `groupPresets: Record<presetId, GroupMember[]>` const that the provider reads).
- **Change** `plugins/ai-agent/src/runtime/createModelProviderRuntime.ts`: in `createProviderInstance` (or a guard inside `getProvider`), special-case `providerId === 'group'` to build `new MultiModelGroupProvider({ resolveMemberProvider: (id) => this.getProvider(id, { fresh: true }), getGroupConfig: () => readPresetFromConfig(currentPresetModelId) })`. This keeps `DEFAULT_FACTORIES` (module-level) free of the group/`this`-bound dependency.
- **Rationale:** the group needs `runtime.getProvider` (instance method) and the currently-selected preset, neither of which a static factory can supply cleanly; an explicit special-case is the smallest honest seam.

### Decision 3: `DomAutomationProvider` is a thin `IModelProvider` over a `controlled-page` transport
- **New** `plugins/ai-agent/src/providers/model/dom/domTransport.ts`:
  - `export interface DomTransport { open(input): Promise<void>; injectAndSubmit(prompt, requestId): Promise<void>; subscribe(onEvent): () => void }` built over the `ControlledPageCapability` (`openControlledPage` / `evaluateInPage` / `subscribeControlledPageEvent`). No site knowledge here.
- **New** `plugins/ai-agent/src/providers/model/dom/DomAutomationProvider.ts` implementing `IModelProvider` (constructed twice with ids `chatgpt-dom` / `gemini-dom`, each given its `targetUrl`):
  - `sendMessage(prompt, options, onUpdate)`: generate a `requestId`; `transport.open()`; `const off = transport.subscribe(ev => { if (ev.requestId !== requestId) return; if (ev.type==='chunk') onUpdate({ text: ev.text }); ... })`; `transport.injectAndSubmit(prompt, requestId)`; await a `done`/`error` event (or timeout); on timeout, **fallback** to a one-shot `evaluateInPage` read of the final text; `off()`; return `ProviderSendResult`.
  - `abort()`: unsubscribe + best-effort stop.
- **Rationale:** keeping site selectors/injection out of the provider (they live in the desktop DOM preloads) preserves the provider as a platform-agnostic `IModelProvider` so it can also be a group member.

### Decision 4: Controlled-page event subscription (push) — extend the capability + desktop wiring
- **Change** `packages/core/src/interfaces/ControlledPageCapability.ts`: add
  - `subscribeControlledPageEvent(providerId: string, listener: (event: ControlledPageEvent) => void): () => void`
  - `export interface ControlledPageEvent { providerId: string; requestId: string; type: 'chunk' | 'done' | 'error'; text?: string; message?: string }`
- **New** `apps/desktop2/main/preload/chatgptDomPreload.ts` and `geminiDomPreload.ts`: resident `MutationObserver` over the latest assistant reply node; site adapter encapsulates `targetUrl`, `injectAndSubmit(prompt, requestId)` selectors, reply-node location, and end-detection (stop-button gone + text-stable window + timeout). Reports via `ipcRenderer.send(channel, payload)`. Ports openteam's `responseContainers` / `replyObserver` / `replyTracker` / `replyTimeout` / `replyCompensation` / `reportableReply`, replacing `chrome.runtime` with Electron IPC.
- **Change** `apps/desktop2/main/controlledPageIpc.ts`: register the two preloads in `preloadRegistry`; forward page→main events, stamp `providerId`, relay to renderer windows via `webContents.send` (mirrors the existing `console-message` one-way forward and `emitToRendererWindows` login pattern).
- **Change** `apps/desktop2/main/preload.ts`: expose `subscribeControlledPageEvent(listener)` (`ipcRenderer.on` + return unsubscribe), mirroring `onProviderLoginCompleted`.
- **Change** `apps/desktop2/src/context/createDesktop2HostContext.ts`: wire the new capability method into the host `ControlledPageCapability`.
- **Observability** (per AGENTS.md, cross-process/DOM/timing): log at each hop — controlled-page ready, inject success, `requestId` bind, first chunk, end-detection, timeout/error, fallback trigger.

## Risks / Trade-offs

- **Selector brittleness** (site redesign breaks DOM provider) → per-site adapter + desktop e2e on the real link (no site mock); polling fallback prevents hard hang.
- **End-of-generation detection unreliable** (no stable "stop generating" signal) → combine stop-button-gone + text-stable window + timeout; fallback re-read.
- **`requestId` cross-talk** (stale pushes from a previous turn) → provider filters every event by `requestId`; preload stamps it from `injectAndSubmit`.
- **Group abort partial** (some members ignore abort) → track started instances per send and call `abort()` on each; merged transcript still resolves from buffered text.
- **Group double instances / cache** (members via `getProvider(id, { fresh: true })`) → use fresh instances so group runs don't disturb the singleton cache used by standalone selection.
- **Desktop-only DOM provider** (web/extension can't inject) → product accepts the limitation; selector lists shared from openteam reduce maintenance.
- **Architecture-doc drift** → archive step must merge the design class diagram into `workspace.dsl` and update `ARCHITECTURE.zh-CN.md`; verify checks consistency.

## Migration Plan

Phased, single change (verify runs full e2e per AGENTS.md before archive):
- **P1**: `MultiModelGroupProvider` + `group/` + config preset + runtime special-case (members = `chatgpt-codex` + `gemini-api`). Validate by unit tests (broadcast / `@mention` / concurrent merge / abort fan-out) + `tsc --noEmit` + `lint`.
- **P2**: extend `ControlledPageCapability` + desktop page→main→renderer event lane + `DomAutomationProvider` + ChatGPT DOM preload/adapter. Validate by desktop e2e (login → ask → push streaming → done; fallback path).
- **P3**: Gemini DOM preload/adapter reusing the P2 framework. Same e2e shape.

Rollback: the group pseudo-provider and DOM provider ids are additive in config/runtime; removing the config entries and the runtime special-case fully disables them without affecting existing providers.

## Open Questions

- Final shape of the team-preset config (`groupPresets` const vs inline in each `group` model entry) — defaults to a `groupPresets` map keyed by preset model id.
- Whether `generateConversationTitle` should be delegated to the first member or skipped for the group (MVP: skip / use a generic title).
- Exact end-detection thresholds per site (text-stable window / timeout) — to be tuned during P2/P3 e2e.
