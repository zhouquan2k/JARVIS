## Context

当前仓库已经完成两块基础设施：一是共享聊天工作台已经落地，`packages/ui/src/views/ConversationWorkspaceView.vue`、`packages/ui/src/components/ConversationSidebar.vue` 和 `packages/ui/src/store/chat.ts` 能承载本地会话与 ChatGPT 外部历史预览/导入；二是扩展宿主已经具备 `UI -> Background Proxy -> Provider` 的运行时链路，`apps/extension/src/providerRuntime.ts`、`apps/extension/src/utils/BackgroundHistoryProxy.ts` 与 `apps/extension/entrypoints/background.ts` 可以把历史请求转发给真实 provider。

但 Gemini 相关能力目前只覆盖 API 聊天，不覆盖官网历史。`packages/core/src/providers/GeminiApiProvider.ts` 只处理模型调用；`packages/core/src/interfaces/IHistoryProvider.ts` 与会话来源元数据目前仍偏向单一 provider 设计；`apps/extension/wxt.config.ts` 也只声明了 `chatgpt.com` 的站点权限。与此同时，`apps/server` 当前只暴露同步 API 和健康检查，没有任何 provider 规则配置接口。

`phase-9.md` 要求把 Gemini 官网历史接入共享工作台，并采用“云端配置驱动的 DOM 抓取”方案。结合最新 UI 约束，工作台第一层仍然是“本地 / 外部”，只有进入“外部”后才进一步选择具体 provider。这个变更跨越 UI、核心接口、扩展后台/内容脚本以及服务端配置分发，属于典型的跨模块架构升级，需要先固定设计边界。

## Goals / Non-Goals

**Goals:**

- 在共享工作台中保持“本地 / 外部”一级切换，并在外部视图中提供 `ChatGPT / Gemini / 外部文件导入` 二级来源选择。
- 为 Gemini 官网实现独立的历史 provider，支持获取历史摘要列表、详情、只读预览和导入本地。
- 将 Gemini 抓取逻辑建立在远程规则配置之上，使选择器更新不依赖重新发布扩展。
- 让 UI 继续只消费标准化后的 `Conversation`，不感知 Gemini DOM 结构、懒加载或抓取细节。
- 当 Gemini 页面结构变化、未登录或规则拉取失败时，返回规范化错误并提供可降级的用户提示。

**Non-Goals:**

- 不逆向 Gemini 内部 RPC 或私有接口，首版仅走 DOM 抓取。
- 不在 `apps/web` 中接入 Gemini 官网历史，首版只支持浏览器扩展宿主。
- 不实现 Gemini 历史的全文搜索、收藏、标签、摘要提纯或自动同步。
- 不在本阶段支持任意第三方 provider 扩展，外部来源先只固定 `ChatGPT / Gemini / 外部文件导入` 三个入口。
- 不尝试完整保留 Gemini 页面中的所有富媒体语义；首版以稳定导入文本、图片和基础附件为目标。

## Decisions

### 决策 1：保持“本地 / 外部”一级来源，并把外部入口升级为 provider 注册表

**选择**

当前 `chatStore` 只有一个 `historyProvider` 和一个二态 `historySource: 'local' | 'external'`。一级来源本身已经符合新的 UI 约束，但“外部”内部还无法表达 `ChatGPT / Gemini / 外部文件导入` 三个选择。新的状态模型改为“一级来源 + 外部 provider 注册表”：

```ts
export type WorkspaceHistorySource = 'local' | 'external';

export type ExternalHistoryProviderId = 'chatgpt-web' | 'gemini-web' | 'external-file';

export type ConversationOrigin = 'local' | ExternalHistoryProviderId;

export interface WorkspaceHistoryProviderEntry {
  id: ExternalHistoryProviderId;
  label: string;
  kind: 'history-provider' | 'file-import';
  provider?: IHistoryProvider;
}
```

`packages/ui/src/store/chat.ts` 的关键签名调整为：

```ts
setHistoryProviders(entries: WorkspaceHistoryProviderEntry[]): void;
setHistorySource(source: WorkspaceHistorySource): Promise<void>;
setActiveExternalProvider(providerId: ExternalHistoryProviderId): Promise<void>;
previewExternalConversation(providerId: string, externalId: string): Promise<void>;
openExternalFileImport(): Promise<void>;
```

UI 仍然只处理本地会话和标准化后的 `Conversation`；一级来源切换、外部 provider 切换、文件导入入口和外部列表加载都由 store 统一管理。

持久化层不再引入单独的来源枚举类型，而是直接在 `Conversation` 上保存：

```ts
type ConversationOrigin = 'local' | 'chatgpt-web' | 'gemini-web' | 'external-file';

interface Conversation {
  origin?: ConversationOrigin;
  externalId?: string;
}
```

**涉及文件**

- `packages/core/src/interfaces/IHistoryProvider.ts`
- `packages/core/src/interfaces/IStorageProvider.ts`
- `packages/core/src/index.ts`
- `packages/ui/src/store/chat.ts`
- `packages/ui/src/views/ConversationWorkspaceView.vue`
- `packages/ui/src/components/ConversationSidebar.vue`
- `apps/extension/src/providerRuntime.ts`
- `apps/extension/src/App.vue`

**变更说明**

- 在 `Conversation` 上增加 `origin` 字段，而不是维护另一套平行来源类型。
- 将 `chatStore` 从单一 `historyProvider` 扩展为外部 provider 注册表。
- 一级来源仍是“本地 / 外部”；进入外部后再由二级 provider 入口决定显示 ChatGPT、Gemini 历史列表，或触发文件导入流程。

**备选方案**

- 方案 A：把 `ChatGPT / Gemini / 文件导入` 硬塞进一级来源。缺点是会破坏你要求保留的“本地 / 外部”主心智。
- 方案 B：为每个 provider 单独复制一套 workspace/store。缺点是状态分叉严重，后续新增 provider 的成本会线性上升。

### 决策 2：Gemini 抓取器采用“后台调度 + 受控标签页 + 内容脚本”的三段式结构

**选择**

Gemini 官网历史不走 `packages/core` 里的通用 API provider，而是新增扩展侧 DOM 抓取 provider：

```ts
export class GeminiDomHistoryProvider implements IHistoryProvider {
  id = 'gemini-web';

  constructor(private readonly deps: {
    configLoader: GeminiHistoryConfigLoader;
    tabBridge: GeminiHistoryTabBridge;
  }) {}

  getHistoryList(): Promise<ConversationHistorySummary[]>;
  getHistoryDetail(externalId: string): Promise<Conversation>;
}
```

执行链路如下：

- `apps/extension/entrypoints/background.ts` 保持历史请求入口不变，收到 `providerId = 'gemini-web'` 后解析到 `GeminiDomHistoryProvider`。
- Provider 通过 `GeminiHistoryTabBridge` 确保存在一个可复用的 Gemini 标签页；若当前没有目标页，则静默创建或复用后台标签页。
- WXT 内容脚本运行在 Gemini 页面上下文，负责依据远程配置执行 DOM 查询、必要的滚动加载和详情采集，并把原始结果回传给 background。
- Provider 在 background 内完成标准化，把 DOM 结果转换为统一的 `ConversationHistorySummary[]` 或 `Conversation`。

标准化结果中的来源字段也统一使用：

```ts
interface ConversationHistorySummary {
  id: string;
  title: string;
  updatedAt: number;
  origin: 'chatgpt-web' | 'gemini-web';
  isImported?: boolean;
}
```

**涉及文件**

- `apps/extension/wxt.config.ts`
- `apps/extension/entrypoints/background.ts`
- `apps/extension/entrypoints/gemini-history.content.ts`
- `apps/extension/src/providerRuntime.ts`
- `apps/extension/src/history/GeminiDomHistoryProvider.ts`
- `apps/extension/src/history/GeminiHistoryTabBridge.ts`
- `apps/extension/src/history/geminiContentProtocol.ts`
- `apps/extension/tests/e2e/extension-host.spec.ts`

**变更说明**

- `apps/extension/wxt.config.ts` 需要新增 Gemini 域名的 `host_permissions` 和内容脚本匹配规则。
- Background 只负责调度和错误封装，不直接写死 DOM 选择器。
- 内容脚本只关注页面抓取，不直接触碰 UI store 或本地存储。

**备选方案**

- 方案 A：在 UI 页直接抓 Gemini DOM。缺点是扩展主页面拿不到 Gemini 页面的 DOM，也会绕不开权限和上下文隔离问题。
- 方案 B：逆向 Gemini RPC。缺点是稳定性差、风控高，与 phase-9 的“低维护成本”目标相反。

### 决策 3：远程规则配置由现有 `apps/server` 分发，并带本地缓存与回退快照

**选择**

不新建独立服务，直接在现有 `apps/server` 增加 provider 配置分发接口，例如：

```ts
GET /api/provider-configs/gemini-history
```

配置契约定义为：

```ts
export interface GeminiHistoryRemoteConfig {
  version: string;
  matchOrigins: string[];
  selectors: {
    historyListContainer: string;
    historyListItem: string;
    historyTitle: string;
    historyLink: string;
    conversationRoot: string;
    userBubble: string;
    assistantBubble: string;
    lazyLoadSentinel?: string;
  };
  healthCheck: {
    requiredSelectors: string[];
    maxMissingCount: number;
  };
}
```

扩展侧通过 `GeminiHistoryConfigLoader` 拉取配置，并将最后一次成功结果缓存到本地。若网络失败但缓存仍可用，则继续使用缓存；若缓存与内置回退快照都不可用，则返回 `CONFIG_UNAVAILABLE` 错误。

**涉及文件**

- `packages/core/src/interfaces/ProviderRemoteConfig.ts`
- `packages/core/config.ts`
- `apps/server/src/app.ts`
- `apps/server/src/routes/providerConfigs.ts`
- `apps/server/src/config.ts`
- `apps/server/src/provider-configs/gemini-history.json`
- `apps/server/tests/provider-configs.test.ts`
- `apps/extension/src/history/GeminiHistoryConfigLoader.ts`

**变更说明**

- `apps/server` 从“只做同步”扩展为“同步 + provider 配置分发”。
- `packages/core/config.ts` 增加 provider-config 基础地址读取逻辑，例如 `CHATPRISM_PROVIDER_CONFIG_BASE_URL`、`WXT_PROVIDER_CONFIG_BASE_URL`。
- 扩展内保留一个打包时内置的回退快照，保证服务端短暂不可用时不至于完全失能。

**备选方案**

- 方案 A：把选择器硬编码在扩展里。缺点是每次 Gemini 改版都要重新发版。
- 方案 B：把规则放到 `packages/core/config.ts` 静态配置。缺点是它仍然随发版生效，不满足远程修复需求。

### 决策 4：工作台 UI 保持“本地 / 外部”顶层切换，并在外部区增加二级 provider 选择

**选择**

UI 调整为：

- `packages/ui/src/views/ConversationWorkspaceView.vue` 顶层继续展示 `Local / External` 一级切换。
- `packages/ui/src/components/ConversationSidebar.vue` 在 `External` 视图中展示二级 provider 入口：`ChatGPT / Gemini / 外部文件导入`。
- `packages/ui/src/views/NormalChatView.vue` 保持右侧普通聊天/只读预览渲染；外部历史预览态继续在底部操作区内联显示“返回 / 导入”。
- 对比模式下若用户选择 ChatGPT、Gemini 历史或文件导入，宿主先切回普通聊天右栏，再进入对应流程。

建议新增或修改的关键签名：

```ts
type WorkspaceHistorySource = 'local' | 'external';
type ExternalHistoryProviderId = 'chatgpt-web' | 'gemini-web' | 'external-file';
type ConversationOrigin = 'local' | ExternalHistoryProviderId;

setHistorySource(source: WorkspaceHistorySource): Promise<void>;
setActiveExternalProvider(providerId: ExternalHistoryProviderId): Promise<void>;
getVisibleHistoryItems(): Array<Conversation | ConversationHistorySummary>;
```

**涉及文件**

- `packages/ui/src/views/ConversationWorkspaceView.vue`
- `packages/ui/src/components/HistorySourcePanel.vue`
- `packages/ui/src/components/ConversationSidebar.vue`
- `packages/ui/src/views/NormalChatView.vue`
- `packages/ui/src/store/chat.ts`
- `apps/extension/src/App.vue`

**变更说明**

- 顶层 Panel 继续负责“本地 / 外部”主入口。
- 外部 provider 入口在侧边栏或其顶部子区域呈现，负责进一步选择 ChatGPT、Gemini 或文件导入。
- 侧边栏继续保持标题优先和紧凑列表，不堆叠额外元信息。
- 导入成功后恢复到 `local` tab 并激活本地会话，保持用户心智一致。

**备选方案**

- 方案 A：把外部 provider 选择也提升到顶层，与“本地 / 外部”并列。缺点是会把主导航和外部细分来源混在一起，破坏两级结构。
- 方案 B：把文件导入埋到单独按钮而不是和 ChatGPT/Gemini 并列。缺点是外部来源入口不一致，用户难以理解“外部”这一层的完整范围。

### 决策 5：用规范化错误码和健康检查保护 DOM 抓取链路

**选择**

Gemini DOM 抓取是脆弱链路，必须把失败原因从 provider 内部显式传出来。新增统一错误类型：

```ts
export type HistoryProviderErrorCode =
  | 'AUTH_REQUIRED'
  | 'CONFIG_UNAVAILABLE'
  | 'SELECTOR_MISMATCH'
  | 'DETAIL_NOT_FOUND'
  | 'TAB_UNAVAILABLE';

export class HistoryProviderError extends Error {
  constructor(
    public readonly code: HistoryProviderErrorCode,
    message: string,
    public readonly recoverable = true
  ) {
    super(message);
  }
}
```

健康检查策略：

- 内容脚本执行前先校验 `requiredSelectors` 是否命中；
- 连续缺失超过阈值时中断抓取并返回 `SELECTOR_MISMATCH`；
- 未登录或页面重定向时返回 `AUTH_REQUIRED`；
- UI store 只消费规范化错误码，再映射成用户可读提示。

**涉及文件**

- `packages/core/src/errors/HistoryProviderError.ts`
- `apps/extension/src/history/GeminiDomHistoryProvider.ts`
- `apps/extension/src/history/GeminiHistoryConfigLoader.ts`
- `apps/extension/entrypoints/background.ts`
- `packages/ui/src/store/chat.ts`
- `packages/ui/src/views/NormalChatView.vue`

**变更说明**

- 抓取失败不会把 `querySelector` 级别的细节直接暴露给 UI。
- UI 可以根据错误码稳定展示“请稍后再试”“请先登录 Gemini”“页面结构已变化”等提示。

**备选方案**

- 方案 A：直接抛原始异常。缺点是用户不可理解，也不利于 E2E 断言。
- 方案 B：失败时静默返回空列表。缺点是难以区分“真的没有历史”与“抓取已经坏掉”。

## Risks / Trade-offs

- `[Risk] Gemini DOM 结构变化频繁，远程规则也可能追不上页面变化` → `Mitigation`: 配置增加版本号、健康检查和本地回退快照；E2E 用固定 HTML 片段和真实站点 smoke test 双层覆盖。
- `[Risk] 静默创建或复用 Gemini 标签页可能引发权限、焦点或标签页污染问题` → `Mitigation`: 后台统一管理单个受控标签页，优先复用已打开页，创建时默认 inactive，并在失败时回退到显式提示。
- `[Risk] 远程规则配置接口被错误更新会影响所有扩展实例` → `Mitigation`: 服务端配置采用版本化文件和回滚流程；扩展仅在通过健康检查后才接受新配置。
- `[Risk] 两级来源切换会触碰现有 workspace/store 状态机，容易回归 ChatGPT 历史、文件导入和 compare 模式` → `Mitigation`: 保留右侧 `NormalChatView` / `CompareChatView` 不拆散，只扩展来源状态机，并补充 store 单测与 extension E2E。
- `[Risk] Gemini 富媒体消息可能无法一次性完整标准化` → `Mitigation`: 首版只承诺文本、图片和基础附件；对无法稳定映射的节点直接过滤，不阻塞主要导入链路。

## Migration Plan

- 先在 `apps/server` 上线 provider-config 接口和 Gemini 规则文件，确保扩展端有可拉取的配置源。
- 扩展端随后增加 Gemini 域名权限、内容脚本和 provider 装配，但初期可通过 feature flag 或隐藏入口只在开发环境暴露。
- 当 Gemini 外部入口稳定后，再在“外部”视图中默认展示 `Gemini` 选项。
- 若出现线上问题，优先在服务端回滚规则版本；必要时可在扩展端临时隐藏 Gemini tab，而不影响本地和 ChatGPT 流程。

## Open Questions

- Gemini 站点匹配范围应固定为 `https://gemini.google.com/app/*` 还是放宽到 `https://gemini.google.com/*`，需要在真实页面结构上再确认一次。
- 远程规则接口是否需要鉴权或签名校验；若需要，扩展端应如何安全验证配置来源。
- Gemini 历史详情中的图片、文件和富文本标注，首版应保留到什么粒度，是否需要复用现有 `annotations` 契约扩展额外类型。
