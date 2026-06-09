> **语言**: [English](proposal.md) | 中文

## Why

目前 JARVIS 一个会话同一时间只与单个模型 provider 对话；而所有网页型 provider（如 `ChatGPTWebProvider`）都是靠**逆向站点私有 HTTP 协议**访问目标后端——一旦站点强化反爬 / proof-token，链路即断裂。我们希望引入两个彼此正交、可叠加的能力，二者均借鉴自开源项目 [openteam](https://github.com/afumu/openteam)：(1) 让多个模型在**同一会话内协作发言**；(2) 新增一条「DOM 自动化」provider 链路（仅 desktop），直接驱动真实的 ChatGPT/Gemini 页面而非其 HTTP 后端，从而对协议变更更具韧性。

## What Changes

- 引入 `GroupModelProvider`（`id = 'group'`），实现现有 `IModelProvider` 契约，但其内部不调单个模型，而是把请求**编排分发**给一组固定预设的成员 provider：
  - 默认 **广播 + 并发**：预设内所有成员对当前问题并发回答（`Promise.all`）。
  - `@成员名`（可多个）：仅被点名成员回答，仍并发；输入框旁展示**成员名片**（群成员 + `@提示`），让用户了解可用名字。
  - 同一轮内成员之间看不到对方「本轮」回复；**跨轮**可见上一轮全部发言（经 `history` 传入）。
  - 合并后的 transcript（按成员分段，`### {成员名}\n{文本}`）通过 `onUpdate` 流式回推，并作为单条 assistant 消息返回（MVP）。`abort` 透传到全部在跑成员。
  - 成员经 `resolveMemberProvider(providerId) → runtime.getProvider(id)` 统一解析；Group 侧**无任何 provider 特判**——任意 `IModelProvider`（含未来新增）均可作为成员。
- **Group 本期仅支持 DOM 成员**：唯一预设 `dom-group`（成员 = `chatgpt-dom` + `gemini-dom`），删除 `codex-gemini` API 模式预设。`group` provider 的 `defaultModel` 指向 `dom-group`。
- 引入 `DomAutomationProvider`（仅 desktop），在模型选择器中以 `chatgpt-dom` / `gemini-dom` 暴露，驱动真实站点页面：注入提问、点发送、观察 DOM 流式回复。它是普通 `IModelProvider`，既可单独使用、也可作为 Group 成员，并与现有 HTTP 逆向的 `chatgpt-web` provider 并存。
- 新增**受控页事件订阅**能力（push 式，替代轮询）：在 per-provider DOM preload 内常驻 `MutationObserver`，把回复增量沿 页 → 主 → 渲染 主动 push 上来。事件载荷为 `{ providerId, requestId, type: 'chunk' | 'done' | 'error', text?, message? }`；`requestId` 用于把推送对齐到具体一次 `sendMessage`。若观测器异常，提供 `evaluateInPage` 轮询读取最终文本的降级兜底。
- **联网开关**：`group` / `chatgpt-dom` / `gemini-dom` 的模型配置均新增 `web_search` boolean option（默认 `false`）。Group 透传 `modelOptions` 给各成员；`DomAutomationProvider` 在每次 `sendMessage` 注入前通过 `evaluateInPage` 调用 `window.__jarvisSetWebSearch(enabled)` 切换页面联网按钮状态，DOM preload 实现该函数。实现前须先对两个站点做**选择器探活**，确认联网开关的 DOM 锚点。
- 通过配置注册新 provider，且不污染模块级默认值：`APP_CONFIG.providers` 新增一条 `group` 伪 provider，其 `models` 即团队预设；`createModelProviderRuntime.getProvider` 对 `providerId === 'group'` 特判（并仅在 desktop 注册 DOM provider）。
- 发送主链路、store、持久化、模型选择 UI **完全不改**——一切收敛到 `IModelProvider.sendMessage` 契约。
- 更新架构文档（`workspace.dsl` 全局类图、`ARCHITECTURE.zh-CN.md`），体现两个新 provider 实现与受控页事件链路。

## Capabilities

### New Capabilities
- `group-model-provider`：一个 `group` provider（仅 DOM 成员预设 `dom-group`），把广播 / `@点名`定向的请求并发分发给固定团队预设中的成员 `IModelProvider`，将其流式输出合并为单条分段 assistant transcript，并透传 abort；在会话顶部展示成员名片 + @mention 提示。
- `dom-automation-provider`：仅 desktop 的 `IModelProvider`（`chatgpt-dom` / `gemini-dom`），加载受控页、注入并提交提问、经站点适配器观察 DOM 流式回复，并带轮询降级兜底；支持通过 `modelOptions.web_search` 开关联网。

### Modified Capabilities
- `core-interfaces`：`ControlledPageCapability` 新增 `subscribeControlledPageEvent(providerId, listener): () => void`，使 provider 能接收受控页的 push 事件。
- `desktop-host-app`：实现受控页事件链路（per-provider DOM preload 内常驻 `MutationObserver`、页→主→渲染 IPC 转发、preload 暴露 `subscribeControlledPageEvent`），并注册 ChatGPT/Gemini DOM 站点适配器；DOM preload 实现 `window.__jarvisSetWebSearch(enabled)` 联网切换函数。
- `provider-model-selector`：暴露新的可选项——`group`（唯一预设 `dom-group`，含 `web_search` option）以及仅 desktop 的 `chatgpt-dom` / `gemini-dom`（均含 `web_search` option）。
- `runtime-mode-provider-injection`：`getProvider` 对 `providerId === 'group'` 特判，构造 `MultiModelGroupProvider` 并注入 `resolveMemberProvider` / `getGroupConfig`；`DomAutomationProvider` 仅在 desktop runtime 注册。
- `static-config`：`APP_CONFIG.providers` 新增 `group` 伪 provider（唯一预设 `dom-group`，`web_search` option）、`chatgpt-dom` / `gemini-dom`（均含 `web_search` option），以及预设成员清单。

## Impact

- 代码（新增）：`plugins/ai-agent/src/group/`（`groupTypes.ts`、`mentionParser.ts`）、`plugins/ai-agent/src/providers/model/MultiModelGroupProvider.ts`、`plugins/ai-agent/src/providers/model/dom/`（`DomAutomationProvider.ts`、`domTransport.ts`）、`apps/desktop2/main/preload/chatgptDomPreload.ts`、`apps/desktop2/main/preload/geminiDomPreload.ts`。
- 代码（修改）：`packages/core/config.ts`（group 伪 provider + 预设）、`packages/core/src/interfaces/ControlledPageCapability.ts`（订阅方法）、`plugins/ai-agent/src/runtime/createModelProviderRuntime.ts`（group 特判 + DOM 注入）、`apps/desktop2/main/controlledPageIpc.ts`（页→主→渲染事件转发）、`apps/desktop2/main/preload.ts`（`subscribeControlledPageEvent`）、`apps/desktop2/src/context/createDesktop2HostContext.ts`（接线 capability）。
- 测试：group 编排单测（广播 / `@点名` / 并发合并 / abort 透传，成员可 mock）；DOM 链路 desktop e2e（登录 → 提问 → push 流式 → 结束态；降级兜底路径），遵循 AGENTS.md（真实链路、不 mock 站点）。
- 文档：`workspace.dsl`、`ARCHITECTURE.zh-CN.md`。
- 约束：DOM provider **仅 desktop**（web 因 `X-Frame-Options`/CSP 被阻断；extension 本期不做）；选择器脆弱，需每站维护 + e2e；合规与现有网页 provider 同等灰度（第三方 ToS）。
