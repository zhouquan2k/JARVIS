## Context

当前外部历史工作台的核心假设是“当前 provider 只有一个列表视图”。`packages/core/src/interfaces/IHistoryProvider.ts` 中的 `getHistoryList()` 没有任何查询参数，`packages/ui/src/store/chat.ts` 只维护一份 `externalHistoryItems` / `isExternalHistoryLoading` / `currentHistoryErrorCode`，而 `packages/ui/src/components/ConversationSidebar.vue` 也只渲染 provider 切换和统一的历史列表，没有 provider 级搜索输入。

这套模型对“最近一页历史”是足够的，但对“搜索指定聊天记录再导入”不成立。Gemini 侧目前通过 DOM bridge 抓取最近列表；ChatGPT 侧则通过 `ChatGPTWebProvider.getHistoryList()` 固定读取最近 28 条会话。两边都没有把“搜索”作为正式能力接入到统一契约里。用户最新确认的交互是：ChatGPT 与 Gemini 共用同一份搜索关键词，切换 provider 时保留当前 query，并对新 provider 重新发起查询，而不是分别记住两边各自的关键词。

## Goals / Non-Goals

**Goals:**

- 为 `chatgpt-web` 与 `gemini-web` 的外部历史工作台提供一个共享搜索框与共享 query，切换 provider 时沿用同一关键词重新查询当前 provider 的结果。
- 将历史 provider 契约扩展为“最近列表 + 可选搜索”的统一接口，避免 UI 层为不同 provider 写死不同搜索流程。
- 在 ChatGPT Web provider 中补齐历史搜索实现，在 Gemini DOM 历史链路中补齐搜索输入、结果稳定等待和结果抽取。
- 扩展 desktop / extension 代理协议，使 renderer 到 host/background 的 `GET_HISTORY_LIST` 可以透传 `query`。
- 保持 `external-file` 的当前行为不变，不为其新增搜索框或搜索态。

**Non-Goals:**

- 不实现分页读取所有历史记录；空关键词仍只返回 provider 当前的最近会话列表。
- 不在 UI 层做“跨 provider 聚合搜索结果”或混合列表；当前列表始终只展示当前 provider 的结果。
- 不为 `external-file`、未来 provider 或本地历史列表补搜索。
- 不在本次设计中引入新的宿主窗口、独立搜索页或额外的远端服务。

## Decisions

### 决策 1：搜索框组件与关键词状态共享，列表结果随当前 provider 切换重查

**选择**

工作台维护一份共享的搜索关键词，而不是为每个外部 provider 建立独立的 query 状态。

关键文件与签名：

- `/Users/quanzhou/Workspace/ChatPrism/packages/ui/src/store/chat.ts`
  - `externalHistoryQuery: string`
  - `externalHistoryQuerySubmitted: string`
  - `setExternalHistoryQuery(query: string): void`
  - `submitExternalHistoryQuery(query?: string): Promise<void>`
  - `clearExternalHistoryQuery(): Promise<void>`
  - `loadExternalHistory(providerId?: ExternalHistoryProviderId, options?: HistoryListQueryOptions): Promise<void>`
- `/Users/quanzhou/Workspace/ChatPrism/packages/ui/src/components/ExternalHistorySearchBox.vue`
  - 新增复用组件，承载输入框、清空按钮、提交按钮和 loading 展示
- `/Users/quanzhou/Workspace/ChatPrism/packages/ui/src/components/ConversationSidebar.vue`
  - 新增 props：`externalHistoryQuery`、`showExternalHistorySearch`、`externalHistorySearchPlaceholder`
  - 新增事件：`update-external-query`、`submit-external-query`、`clear-external-query`
- `/Users/quanzhou/Workspace/ChatPrism/packages/ui/src/views/ConversationWorkspaceView.vue`
  - 负责把共享 query 与当前 provider 透传给侧边栏

**变更说明**

- ChatGPT 与 Gemini 使用同一套 `ExternalHistorySearchBox` 组件，并共享同一份 query。
- 用户在 `chatgpt-web` 下输入关键词后切到 `gemini-web`，输入框保持原值，系统自动以同一个 query 对 Gemini 重新查询。
- 空关键词时，当前 provider 的结果会回退到“最近列表”结果，而不是清空整块外部历史 UI。

**备选方案**

- 方案 A：为每个 provider 建独立 query 状态。缺点是用户切换 provider 时需要在两个来源之间来回维护不同关键词，交互割裂。
- 方案 B：为每个 provider 写一套独立搜索组件。缺点是 UI 重复实现，后续样式和行为难以收敛。

### 决策 2：统一 `IHistoryProvider` 契约，但只让支持搜索的 provider 声明搜索能力

**选择**

历史 provider 契约扩展为支持可选查询参数，同时通过 provider capability 控制 UI 是否渲染搜索框。

关键文件与签名：

- `/Users/quanzhou/Workspace/ChatPrism/packages/core/src/interfaces/IHistoryProvider.ts`
  - `export interface HistoryListQueryOptions { query?: string }`
  - `getHistoryList(options?: HistoryListQueryOptions): Promise<ConversationHistorySummary[]>`
  - `ExternalHistoryProviderEntry['features']?: { historySearch?: boolean; historySearchPlaceholder?: string }`
- `/Users/quanzhou/Workspace/ChatPrism/apps/web/src/providerRuntime.ts`
- `/Users/quanzhou/Workspace/ChatPrism/apps/desktop/src/providerRuntime.ts`
- `/Users/quanzhou/Workspace/ChatPrism/apps/extension/src/providerRuntime.ts`
  - `chatgpt-web`、`gemini-web` 注册 `historySearch: true`
  - `external-file` 不声明 `historySearch`

**变更说明**

- UI 不再通过 `providerId === 'gemini-web'` 之类的判断硬编码搜索框显隐，而是只看 `ExternalHistoryProviderEntry.features.historySearch`。
- `getHistoryList()` 仍然是历史列表的唯一入口；空 query 时 provider 返回最近列表，非空 query 时 provider 返回搜索结果。UI/store 不直接了解 provider 是接口搜索、DOM 搜索还是页面原生搜索。
- 共享 query 只决定“当前 provider 请求什么关键词”，并不改变 provider 列表结果各自独立的事实。

**备选方案**

- 方案 A：新增单独的 `searchHistoryList(query)` 接口。缺点是 UI 需要感知 provider 是否同时实现 `getHistoryList` 与 `searchHistoryList`，状态机更复杂。
- 方案 B：完全在 UI 做本地过滤。缺点是只能过滤已经加载的少量历史，不能代替真正的远端搜索。

### 决策 3：ChatGPT 与 Gemini 各自实现 provider-specific 搜索，UI 只共享 query 与触发方式

**选择**

ChatGPT 与 Gemini 共享“有 query 就搜索、无 query 就最近列表”的对外契约，但底层搜索适配完全留在各自 provider 内部。

关键文件与签名：

- `/Users/quanzhou/Workspace/ChatPrism/packages/core/src/providers/model/ChatGPTWebProvider.ts`
  - `getHistoryList(options?: HistoryListQueryOptions): Promise<ConversationHistorySummary[]>`
  - 新增私有方法：`private searchHistoryList(query: string): Promise<ConversationHistorySummary[]>`
- `/Users/quanzhou/Workspace/ChatPrism/packages/core/src/providers/history/gemini/GeminiHistoryBridge.ts`
  - `getHistoryList(config: GeminiHistoryRemoteConfig, options?: HistoryListQueryOptions): Promise<GeminiContentHistorySummary[]>`
- `/Users/quanzhou/Workspace/ChatPrism/packages/core/src/providers/history/gemini/GeminiDomHistoryProvider.ts`
  - `getHistoryList(options?: HistoryListQueryOptions): Promise<ConversationHistorySummary[]>`
- `/Users/quanzhou/Workspace/ChatPrism/packages/core/src/providers/history/gemini/geminiContentProtocol.ts`
  - `GeminiContentRequest` 新增 `query?: string`

**变更说明**

- ChatGPT：
  - 空 query 沿用当前最近列表实现。
  - 非空 query 走 `searchHistoryList(query)`，由 provider 自行封装 ChatGPT 原生搜索路径，并继续标准化为 `ConversationHistorySummary[]`。
  - 设计上要求搜索结果同时支持标题和正文关键词命中，这与 ChatGPT 官方帮助中心对产品行为的描述一致。
- Gemini：
  - 空 query 继续抓取最近列表。
  - 非空 query 通过 `GeminiHistoryBridge` 把 query 传入宿主页面，再由 preload / content script 驱动 Gemini 页面原生搜索框并提取结果。
  - 搜索失败仍复用既有 `AUTH_REQUIRED`、`SELECTOR_MISMATCH`、`DETAIL_NOT_FOUND`、`TAB_UNAVAILABLE` 等标准错误码。
- UI 层共享的只有 query 与搜索触发动作，不共享任何 provider 内部搜索实现和结果缓存。

**备选方案**

- 方案 A：把 ChatGPT 也改造成页面 DOM 搜索。缺点是当前 ChatGPT 历史 provider 已经是 request-based，实现会额外引入页面上下文依赖。
- 方案 B：在 UI 层同时支持“provider 自己搜”和“本地过滤兜底”。缺点是语义混乱，用户无法区分结果来自哪里。

### 决策 4：Gemini 搜索继续走 bridge + 远程配置，补齐搜索 selectors 与等待逻辑

**选择**

Gemini 搜索不新增第二套宿主架构，继续沿用 desktop hidden controlled page / extension content script 的 bridge 方案，只在协议、preload 与远程配置中补搜索能力。

关键文件与签名：

- `/Users/quanzhou/Workspace/ChatPrism/apps/desktop/main/GeminiHistoryPageBridge.ts`
  - `getHistoryList(config: GeminiHistoryRemoteConfig, options?: HistoryListQueryOptions): Promise<GeminiContentHistorySummary[]>`
- `/Users/quanzhou/Workspace/ChatPrism/apps/desktop/main/gemini-history.preload.ts`
  - 新增 `applyHistorySearchQuery(config: GeminiHistoryRemoteConfig, query?: string): Promise<void>`
  - 新增 `waitForHistorySearchSettled(config: GeminiHistoryRemoteConfig, query?: string): Promise<void>`
- `/Users/quanzhou/Workspace/ChatPrism/apps/extension/entrypoints/gemini-history.content.ts`
  - 同步新增搜索输入与等待逻辑
- `/Users/quanzhou/Workspace/ChatPrism/apps/server/src/provider-configs/gemini-history.json`
  - 新增可选 selectors：`historySearchInput`、`historySearchSubmit`、`historySearchClear`、`historySearchResultItem`
- `/Users/quanzhou/Workspace/ChatPrism/packages/core/src/interfaces/ProviderRemoteConfig.ts`
  - `GeminiHistorySelectors` 新增上述可选搜索 selector 字段

**变更说明**

- 搜索 selectors 进入远程配置，避免把 Gemini 原生搜索 DOM 结构硬编码进代码。
- 如果 `historySearchResultItem` 未单独配置，则默认回退到现有 `historyListItem`，减少规则重复。
- preload / content script 在收到非空 query 时，必须按顺序执行：
  1. 定位搜索输入框；
  2. 清空旧 query；
  3. 输入新 query；
  4. 触发回车或搜索按钮；
  5. 等待结果列表稳定；
  6. 再调用现有摘要提取逻辑。

**备选方案**

- 方案 A：把搜索 DOM selector 写死在 preload / content script。缺点是 Gemini 页面变更时仍需重新发版。
- 方案 B：搜索结果单独走一条完全不同的提取协议。缺点是最近列表与搜索结果会形成双份抽取逻辑。

### 决策 5：desktop / extension 代理协议只扩展 `query` 字段，不改现有消息类型

**选择**

代理协议继续使用现有 `GET_HISTORY_LIST` 消息类型，只增加 `query?: string` 字段，而不是发明新的 `SEARCH_HISTORY_LIST` action。

关键文件与签名：

- `/Users/quanzhou/Workspace/ChatPrism/apps/desktop/shared/proxyProtocol.ts`
  - `interface GetHistoryListRequest { action: 'GET_HISTORY_LIST'; providerId: string; query?: string; ... }`
- `/Users/quanzhou/Workspace/ChatPrism/apps/extension/src/utils/proxyProtocol.ts`
  - 通过桌面共享协议同步获得 `query?: string`
- `/Users/quanzhou/Workspace/ChatPrism/apps/desktop/src/utils/DesktopHistoryProxy.ts`
  - `getHistoryList(options?: HistoryListQueryOptions): Promise<ConversationHistorySummary[]>`
- `/Users/quanzhou/Workspace/ChatPrism/apps/extension/src/utils/BackgroundHistoryProxy.ts`
  - `getHistoryList(options?: HistoryListQueryOptions): Promise<ConversationHistorySummary[]>`
- `/Users/quanzhou/Workspace/ChatPrism/apps/desktop/main/providerHost.ts`
  - `handleGetHistoryList(msg: GetHistoryListRequest, sendResponse: ResponseSender)`
- `/Users/quanzhou/Workspace/ChatPrism/apps/extension/entrypoints/background.ts`
  - `GET_HISTORY_LIST` 分支调用 `provider.getHistoryList({ query: msg.query })`

**变更说明**

- renderer 和 host/background 之间仍然只有一个“拿历史列表”的消息类型，是否搜索完全由 `query` 是否为空决定。
- 这样可以最大程度复用现有请求关联和错误回包逻辑，不额外增加新的协议分支。

**备选方案**

- 方案 A：新增 `SEARCH_HISTORY_LIST` action。缺点是 renderer、proxy、host、测试全链路都要扩 action 分支，而实际返回值与错误契约并没有变化。
- 方案 B：query 不透传，只让 renderer 根据 providerId 直接调用真实 provider。缺点是会破坏 desktop / extension 的代理边界。

## Risks / Trade-offs

- `[风险] 共享 query 后，切换 provider 会自动触发重新查询，可能放大请求频率` → 仅在用户显式提交 query 后记录 `externalHistoryQuerySubmitted`；provider 切换时只复用最近一次已提交关键词，而不是每次输入变更都立即请求。
- `[风险] ChatGPT 搜索实现可能依赖不同于最近列表的原生能力` → 将搜索封装为 provider 内部私有路径，对外仍只暴露 `getHistoryList({ query })`，避免 UI/store 受实现差异影响。
- `[风险] Gemini 搜索 DOM 比最近列表更脆弱` → 把搜索 selector 放入远程配置，并在 preload / content script 中增加“输入框命中 / 提交 / 结果条数”的关键阶段日志。
- `[风险] 切换 provider 后沿用共享 query 可能得到空结果，用户误以为该 provider 不支持该主题` → 保持当前 provider 标识清晰可见，并在空结果态中展示当前 provider 名称与 query，避免误解为系统故障。

## Migration Plan

1. 先扩展 `IHistoryProvider`、provider capability 和 desktop / extension `GetHistoryListRequest`，让 `query` 可以全链路透传。
2. 在 `packages/ui` 中引入 `ExternalHistorySearchBox`，并把现有单份外部历史列表状态扩展为“共享 query + 当前 provider 结果”的模型。
3. 在 `ChatGPTWebProvider` 中实现 `searchHistoryList(query)`，并保持空 query 兼容旧最近列表逻辑。
4. 在 Gemini core bridge、desktop preload、extension content script 与远程配置中补齐 query 驱动和搜索结果抽取。
5. 回归 `packages/ui`、core、desktop、extension 相关测试；若涉及 extension e2e，按仓库要求申请提权并使用 `channel: 'chromium'`。

回滚策略：

- 若 ChatGPT 或 Gemini 任一侧搜索实现不稳定，可单独让对应 provider 的 `historySearch` capability 回退为 `false`，保留最近列表能力。
- 若共享 query 方案引发 UI 回归，可回退到“无搜索态”的单列表模型，同时保留接口层 `query` 扩展，为后续重新接入搜索保留基础。

## Open Questions

- ChatGPT Web 历史搜索在当前宿主抽象下优先走 request-based 搜索还是需要页面原生搜索桥接，需要在实现阶段通过宿主请求能力验证具体路径；该验证不影响本次对外契约与 UI/store 设计。
