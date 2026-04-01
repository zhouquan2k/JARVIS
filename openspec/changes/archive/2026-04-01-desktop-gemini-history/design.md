## Context

当前 desktop 宿主已经具备基础的 provider proxy、登录窗口管理和受控页面管理能力，但 `apps/desktop/main/index.ts` 在解析 `gemini-web` 历史 provider 时仍直接抛出 `Desktop Gemini history provider is not implemented yet`。这意味着 desktop 虽然在 UI 上暴露了 `gemini-web` 入口，实际上却没有 Gemini 历史抓取、登录恢复和详情预览能力。

同时，`packages/core/src` 经过多轮迭代后出现了明显的边界漂移：`providers` 同时承载模型、历史、上下文和存储实现；`agent-tools`、`agents`、`runtime` 各自包含一部分 agent 运行时逻辑；`analysis/ComparisonAnalyzer.ts` 与 `workflows/CompareWorkflowController.ts` 又被拆在两个平级顶层目录。继续在这个结构上补 desktop Gemini 历史，会让共享实现复用、barrel 导出稳定性和 app 层 import 维护越来越难控制。

这次变更因此合并两类工作：一类是补齐 desktop Gemini 历史导入，使 desktop 与 extension 共享 Gemini 历史内核；另一类是对 `packages/core/src` 做一次目录收口，为后续 provider、agent runtime 和 compare workflow 演进建立更清晰的边界。

## Goals / Non-Goals

**Goals:**

- 在 desktop 主进程中实现 `gemini-web` 历史列表与详情抓取，替换当前未实现占位。
- 将 Gemini 历史共享逻辑沉淀到 `packages/core/src/providers/history/gemini/`，由 desktop 与 extension 分别注入宿主 bridge。
- 让 desktop renderer 在 Gemini 外部历史 `AUTH_REQUIRED` 时显示 `登录 Gemini` 按钮，并在登录窗口关闭后自动刷新当前历史列表。
- 对 `packages/core/src` 做目录收口，同时保持 `packages/core/src/index.ts` 的公共导出稳定，不要求 app 层理解新的内部目录结构。
- 为 core、desktop main 和 desktop renderer 补足测试回归，验证目录迁移后行为不变。

**Non-Goals:**

- 不改变 Gemini 历史远程配置、缓存回退和错误码的既有语义。
- 不新建 desktop 专属的第二套 Gemini DOM 抓取实现；共享逻辑仍以 core 层为准。
- 不通过壳文件兼容旧路径；目录迁移后全仓统一更新 import。
- 不扩展新的外部历史 provider，也不重做工作台的“本地 / 外部”一级导航结构。

## Decisions

### 决策 1：将 `packages/core/src` 收口到按职责划分的稳定目录边界

**选择**

`packages/core/src` 统一收口到以下结构：

- `providers/model/*`
- `providers/history/gemini/*`
- `providers/context/*`
- `providers/storage/*`
- `providers/sync/*`
- `agents/config/*`
- `agents/tools/*`
- `agents/runtime/*`
- `runtime/*` 仅保留 provider runtime
- `workflows/compare/*`

关键文件与签名保持或迁移为：

- `/Users/quanzhou/Workspace/ChatPrism/packages/core/src/index.ts`
  - 继续稳定导出公共 API
- `/Users/quanzhou/Workspace/ChatPrism/packages/core/src/agents/augmentPromptWithAgentContext.ts`
  - `augmentPromptWithAgentContext(prompt: string, options: AugmentPromptWithAgentContextOptions): string`
- `/Users/quanzhou/Workspace/ChatPrism/packages/core/src/agents/tools/createAgentToolExecutor.ts`
  - `createAgentToolExecutor(definitions: AgentToolDefinition[] = []): AgentToolExecutor`
- `/Users/quanzhou/Workspace/ChatPrism/packages/core/src/agents/runtime/createAgentRuntime.ts`
  - `createAgentRuntime(options: CreateAgentRuntimeOptions): AgentRuntime`
- `/Users/quanzhou/Workspace/ChatPrism/packages/core/src/agents/runtime/types.ts`
  - 承载 `AgentRuntime`、`AgentRuntimeRequest` 等 agent 运行时类型
- `/Users/quanzhou/Workspace/ChatPrism/packages/core/src/runtime/createProviderRuntime.ts`
  - `createProviderRuntime(options: CreateProviderRuntimeOptions): ProviderRuntime`
- `/Users/quanzhou/Workspace/ChatPrism/packages/core/src/runtime/providerRuntime.types.ts`
  - 承载 `ProviderRuntime`、`ProviderRuntimeOptions`、`RuntimeProviderFactory`
- `/Users/quanzhou/Workspace/ChatPrism/packages/core/src/workflows/compare/ComparisonAnalyzer.ts`
  - `class ComparisonAnalyzer`
- `/Users/quanzhou/Workspace/ChatPrism/packages/core/src/workflows/compare/CompareWorkflowController.ts`
  - `class CompareWorkflowController`
- `/Users/quanzhou/Workspace/ChatPrism/packages/core/src/workflows/compare/types.ts`
  - 承载 `AnalysisResult` 与 compare workflow 相关类型

**变更说明**

- `providers` 按接口类型分层，避免模型 provider、DOM history provider、上下文 provider 和存储 provider 混在同一层。
- `agent-tools` 顶层目录删除，全部并入 `agents/tools`；`runtime/createAgentRuntime.ts` 与 agent 相关类型并入 `agents/runtime`。
- `runtime` 顶层只保留 provider runtime 基础设施；agent 相关实现不再与 provider runtime 混放。
- `analysis/ComparisonAnalyzer.ts` 并入 `workflows/compare/`，让 compare analyzer 与 controller 形成同一工作流目录。
- 全仓直接更新 import，不保留旧路径壳文件；`packages/core/src/index.ts` 继续对 app 层提供稳定出口。

**备选方案**

- 方案 A：保留旧目录，再用壳文件兼容新路径。缺点是内部边界继续失真，后续迁移成本更高。
- 方案 B：只在 `index.ts` 上做导出整理，不移动文件。缺点是 app 层 import 仍会依赖混乱深路径，无法真正收口。

### 决策 2：将 Gemini 历史内核固化为 core 层共享实现，由宿主注入 bridge

**选择**

Gemini 历史共享实现集中放在 `/Users/quanzhou/Workspace/ChatPrism/packages/core/src/providers/history/gemini/`，由 core 层定义 bridge 与 provider，具体宿主只负责提供页面访问能力。

关键文件与签名：

- `/Users/quanzhou/Workspace/ChatPrism/packages/core/src/providers/history/gemini/GeminiHistoryBridge.ts`
  - `getHistoryList(config: GeminiHistoryRemoteConfig): Promise<GeminiContentHistorySummary[]>`
  - `getHistoryDetail(config: GeminiHistoryRemoteConfig, externalId: string): Promise<GeminiContentConversationDetail>`
- `/Users/quanzhou/Workspace/ChatPrism/packages/core/src/providers/history/gemini/GeminiHistoryConfigLoader.ts`
  - `constructor(options: { storage: ConfigStorage; env?: Record<string, string | undefined>; fetchImpl?: typeof fetch; now?: () => number; builtinConfig?: GeminiHistoryRemoteConfig })`
  - `load(): Promise<ProviderRemoteConfigLoadResult<GeminiHistoryRemoteConfig>>`
  - `markValidated(config: GeminiHistoryRemoteConfig): Promise<void>`
- `/Users/quanzhou/Workspace/ChatPrism/packages/core/src/providers/history/gemini/GeminiDomHistoryProvider.ts`
  - `getHistoryList(): Promise<ConversationHistorySummary[]>`
  - `getHistoryDetail(externalId: string): Promise<Conversation>`
- `/Users/quanzhou/Workspace/ChatPrism/packages/core/src/providers/history/gemini/geminiContentProtocol.ts`
- `/Users/quanzhou/Workspace/ChatPrism/packages/core/src/providers/history/gemini/geminiContentHealth.ts`
- `/Users/quanzhou/Workspace/ChatPrism/packages/core/src/providers/history/gemini/geminiHistoryListTitle.ts`
- `/Users/quanzhou/Workspace/ChatPrism/packages/core/src/providers/history/gemini/geminiMessageSerializer.ts`

**变更说明**

- `GeminiDomHistoryProvider` 不再绑定单一宿主实现，而是只依赖 `GeminiHistoryBridge`。
- 远程配置、缓存回退、builtin 回退与已确认错误码保持不变，包括 `AUTH_REQUIRED`、`CONFIG_UNAVAILABLE`、`SELECTOR_MISMATCH`、`DETAIL_NOT_FOUND`、`TAB_UNAVAILABLE`。
- extension 继续通过内容脚本桥接 DOM；desktop 则通过主进程受控页面 + preload 注入桥接 DOM。两端共享同一套标题提取、健康检查和消息序列化逻辑。

**备选方案**

- 方案 A：为 desktop 单独复制一份 Gemini DOM 抓取逻辑。缺点是规则健康检查和消息标准化会立刻产生双份实现。
- 方案 B：让 core 直接依赖 Electron 或扩展 API。缺点是 core 层失去宿主无关性。

### 决策 3：desktop 主进程以“隐藏受控页面 + preload bridge”实现 Gemini 历史抓取

**选择**

desktop 主进程新增 Gemini 专用页面 bridge，由主进程创建隐藏受控窗口加载 Gemini 页面，再通过 preload 将共享 DOM 抽取协议注入页面上下文。

关键文件与签名：

- `/Users/quanzhou/Workspace/ChatPrism/apps/desktop/main/GeminiHistoryPageBridge.ts`
  - `class GeminiHistoryPageBridge implements GeminiHistoryBridge`
- `/Users/quanzhou/Workspace/ChatPrism/apps/desktop/main/gemini-history.preload.ts`
  - 向 Gemini 页面注入列表抓取与详情抓取入口
- `/Users/quanzhou/Workspace/ChatPrism/apps/desktop/main/controlledPageManager.ts`
  - `ensurePage(providerId: string, options?: ControlledPageOptions & { preloadPath?: string }): Promise<WebContents>`
- `/Users/quanzhou/Workspace/ChatPrism/apps/desktop/main/index.ts`
  - `resolveHistoryProvider(providerId: string): Promise<IHistoryProvider | undefined>`
- `/Users/quanzhou/Workspace/ChatPrism/apps/desktop/main/providerHost.ts`
  - 继续通过 `resolveHistoryProvider(...)` 注入历史 provider
- `/Users/quanzhou/Workspace/ChatPrism/apps/desktop/main/authWindow.ts`
  - `openProviderLoginWindow(providerId: string, options?: { targetUrl?: string; parent?: BrowserWindow | null }): WindowLike`

**变更说明**

- `controlledPageManager.ensurePage(...)` 增加 `preloadPath`，以便 `gemini-web` 受控页面加载 Gemini 专用 preload。
- `index.ts` 中 `resolveHistoryProvider('gemini-web')` 从当前占位异常改为 lazy singleton：`GeminiHistoryConfigLoader + GeminiHistoryPageBridge + GeminiDomHistoryProvider`。
- `GeminiHistoryPageBridge` 负责：
  - 复用隐藏受控页面；
  - 调用 preload 暴露的 DOM 抽取能力；
  - 将登录页、错误页、详情缺失、页面不可用等状态映射为规范化 `ExternalHistoryError`。
- `authWindow.ts` 为 `gemini-web` 增加 `DEFAULT_GEMINI_HISTORY_PAGE_URL` 登录地址，窗口标题固定为 `登录 Gemini`，并继续复用 `persist:chatprism-gemini`。

**备选方案**

- 方案 A：在 renderer 中直接打开网页并抓取 DOM。缺点是会破坏 desktop proxy 的宿主边界，也拿不到受控 Session。
- 方案 B：主进程直接写死页面执行脚本，不走 preload。缺点是桥接协议不可测，也难以复用共享 DOM 抽取逻辑。

### 决策 4：renderer 通过共享工作台错误恢复入口触发 Gemini 登录

**选择**

desktop renderer 不直接理解 Electron 页面抓取细节，只在共享工作台错误态上承接宿主恢复动作。

关键文件与签名：

- `/Users/quanzhou/Workspace/ChatPrism/packages/ui/src/views/NormalChatView.vue`
  - `hostRecoveryMessage?: string`
  - `hostRecoveryActionLabel?: string`
  - `hostRecoveryActionDisabled?: boolean`
  - `request-host-recovery`
- `/Users/quanzhou/Workspace/ChatPrism/packages/ui/src/views/ConversationWorkspaceView.vue`
  - 透传 `hostRecovery*` props 与 `request-host-recovery` 事件
- `/Users/quanzhou/Workspace/ChatPrism/apps/desktop/src/App.vue`
  - `requestProviderLogin(providerId: 'chatgpt-web' | 'gemini-web'): Promise<void>`
  - `onProviderLoginWindowClosed(providerId: 'chatgpt-web' | 'gemini-web'): Promise<void>`

**变更说明**

- 当当前来源为 `gemini-web` 外部历史，且共享 store 暴露错误码 `AUTH_REQUIRED` 时，`NormalChatView` 在错误区域显示 `登录 Gemini` 等宿主恢复动作。
- `ConversationWorkspaceView` 只负责透传恢复 props 和恢复事件，不引入 desktop 专属逻辑。
- `App.vue` 统一处理登录恢复：用户点击 `登录 Gemini` 后调用 `openProviderLoginWindow('gemini-web')`；登录窗口关闭后，如果当前仍停留在 `gemini-web` 外部历史，则调用 `chatStore.loadExternalHistory('gemini-web')` 刷新列表。

**备选方案**

- 方案 A：把 `登录 Gemini` 逻辑写死在 `packages/ui`。缺点是共享 UI 会泄露宿主实现细节。
- 方案 B：在 `App.vue` 中直接判断错误并弹独立浮层。缺点是会绕开已有共享工作台错误呈现路径。

## Risks / Trade-offs

- `[风险] core 目录迁移会产生大面积 import 变更` → 通过先迁移文件、后统一更新 import、最后校验 `packages/core/src/index.ts` 导出来降低破坏面。
- `[风险] preload bridge 若边界不清晰，可能把 Electron 细节泄露到 core` → 仅在 desktop main 定义 Electron 页面管理，core 只感知 `GeminiHistoryBridge` 抽象。
- `[风险] Gemini 页面结构仍可能变化` → 保持远程配置、健康检查和标准化错误码不变，并将 desktop/extension 统一建立在同一套共享逻辑上。
- `[风险] 隐藏受控页面可能残留失效状态` → 由 `controlledPageManager` 统一管理页面复用与销毁，并在 bridge 层识别登录页、错误页和空详情。

## Migration Plan

1. 先在 `packages/core/src` 完成目录迁移与 barrel 导出收口，并同步更新所有 app 层 import。
2. 将 Gemini 历史共享实现迁入 `providers/history/gemini/`，确保 extension 继续可用。
3. 在 desktop main 增加 `GeminiHistoryPageBridge`、Gemini preload 与 `controlledPageManager.ensurePage(... preloadPath ...)`。
4. 替换 desktop `gemini-web` 历史 provider 占位逻辑，并接入 `登录 Gemini` 恢复交互。
5. 运行 desktop/extension 测试与构建回归，确认迁移后没有路径回归。

回滚策略：

- 若 desktop Gemini bridge 存在阻塞问题，可以整体回退到本次变更前的 `gemini-web` 占位实现。
- 若 core 目录收口引发广泛路径回归，则整体回退本次目录迁移，恢复旧路径树，而不是保留半迁移状态。

## Open Questions

- 当前没有阻塞性开放问题；实现阶段只需要在 desktop preload 与受控页面复用策略上保持和现有 `sessionManager`、`authWindowManager` 一致的安全边界。
