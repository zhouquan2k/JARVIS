> **Language**: English | [中文](proposal.zh-CN.md)

## Why

Today a JARVIS conversation talks to exactly one model provider at a time, and every web-backed provider (e.g. `ChatGPTWebProvider`) reaches its target site by reverse-engineering the site's private HTTP protocol — which breaks whenever the site hardens its anti-bot/proof-token scheme. We want two orthogonal capabilities, both borrowed from the open-source [openteam](https://github.com/afumu/openteam): (1) let multiple models collaborate inside a single conversation, and (2) add a DOM-automation provider lane (desktop only) that drives the real ChatGPT/Gemini pages instead of their HTTP backends, so it stays resilient to protocol changes.

## What Changes

- Introduce a `GroupModelProvider` (`id = 'group'`) that implements the existing `IModelProvider` contract but, instead of calling one model, orchestrates a fixed team preset of member providers:
  - Default behavior is **broadcast + concurrent**: every preset member answers the current question concurrently (`Promise.all`).
  - `@memberName` (one or more) restricts the turn to the mentioned members, still concurrent.
  - Members within the same turn cannot see each other's same-turn replies; **across turns** they see the previous turn's full transcript via `history`.
  - The merged transcript (segmented per member, `### {name}\n{text}`) is streamed back through `onUpdate` and returned as a single assistant message (MVP). `abort` is fanned out to all running members.
  - Members are resolved generically via `resolveMemberProvider(providerId) → runtime.getProvider(id)`; the group makes **no per-provider special case** — any `IModelProvider` (including future ones) can be a member.
- Introduce a `DomAutomationProvider` (desktop only), exposed as selectable models `chatgpt-dom` and `gemini-dom`, that drives the real site pages: inject the prompt, click send, observe the streaming DOM reply. It is a plain `IModelProvider`, usable standalone OR as a group member, and coexists with the existing HTTP-reverse `chatgpt-web` provider.
- Add a **controlled-page event subscription** capability (push-based, replacing polling): a resident `MutationObserver` inside a per-provider DOM preload pushes reply deltas page → main → renderer. The event payload is `{ providerId, requestId, type: 'chunk' | 'done' | 'error', text?, message? }`; `requestId` aligns each push to one `sendMessage`. A degraded fallback re-reads the final text via `evaluateInPage` if the observer misfires.
- Register the new providers through configuration without polluting module-level defaults: `APP_CONFIG.providers` gains a `group` pseudo-provider whose `models` are team presets, and `createModelProviderRuntime.getProvider` special-cases `providerId === 'group'` (and registers DOM providers desktop-only).
- The send main-path, store, persistence, and model-selector UI are **unchanged** — everything converges on the `IModelProvider.sendMessage` contract.
- Update architecture docs (`workspace.dsl` global class diagram, `ARCHITECTURE.zh-CN.md`) to reflect the two new provider implementations and the controlled-page event lane.

## Capabilities

### New Capabilities
- `group-model-provider`: A `group` provider that orchestrates concurrent broadcast / `@mention`-targeted dispatch to a fixed team preset of member `IModelProvider`s, merges their streaming output into one segmented assistant transcript, and fans out abort.
- `dom-automation-provider`: A desktop-only `IModelProvider` (`chatgpt-dom` / `gemini-dom`) that loads a controlled page, injects+submits a prompt, and observes the streaming DOM reply through site adapters, with a polling fallback.

### Modified Capabilities
- `core-interfaces`: `ControlledPageCapability` gains `subscribeControlledPageEvent(providerId, listener): () => void` so providers can receive push events from a controlled page.
- `desktop-host-app`: Implements the controlled-page event lane (per-provider DOM preloads with a resident `MutationObserver`, page→main→renderer IPC forwarding, preload-exposed `subscribeControlledPageEvent`) and registers the ChatGPT/Gemini DOM site adapters.
- `provider-model-selector`: Exposes the new selectable entries — `group` (with its team presets) plus desktop-only `chatgpt-dom` / `gemini-dom`.
- `runtime-mode-provider-injection`: `getProvider` special-cases `providerId === 'group'` to construct `MultiModelGroupProvider` with injected `resolveMemberProvider` / `getGroupConfig`, and registers `DomAutomationProvider` only in the desktop runtime.
- `static-config`: `APP_CONFIG.providers` adds the `group` pseudo-provider, its team-preset `models`/`defaultModel`, and the preset member lists.

## Impact

- Code (new): `plugins/ai-agent/src/group/` (`groupTypes.ts`, `mentionParser.ts`), `plugins/ai-agent/src/providers/model/MultiModelGroupProvider.ts`, `plugins/ai-agent/src/providers/model/dom/` (`DomAutomationProvider.ts`, `domTransport.ts`), `apps/desktop2/main/preload/chatgptDomPreload.ts`, `apps/desktop2/main/preload/geminiDomPreload.ts`.
- Code (modified): `packages/core/config.ts` (group pseudo-provider + presets), `packages/core/src/interfaces/ControlledPageCapability.ts` (subscribe method), `plugins/ai-agent/src/runtime/createModelProviderRuntime.ts` (group special-case + DOM injection), `apps/desktop2/main/controlledPageIpc.ts` (page→main→renderer event forwarding), `apps/desktop2/main/preload.ts` (`subscribeControlledPageEvent`), `apps/desktop2/src/context/createDesktop2HostContext.ts` (wire capability).
- Tests: unit tests for group orchestration (broadcast / `@mention` / concurrent merge / abort fan-out, members mockable); desktop e2e for the DOM lane (login → ask → push streaming → done; degraded fallback path) per AGENTS.md (real link, no site mock).
- Docs: `workspace.dsl`, `ARCHITECTURE.zh-CN.md`.
- Constraints: DOM providers are **desktop only** (web blocked by `X-Frame-Options`/CSP; extension out of scope this round); selectors are brittle and require per-site maintenance + e2e; compliance follows the same gating as existing web providers (third-party ToS).
