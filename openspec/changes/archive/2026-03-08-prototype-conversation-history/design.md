## Context

当前实现里，普通聊天入口集中在 `packages/ui/src/views/NormalChatView.vue`，它已经具备基础的本地历史恢复能力，但历史列表仍是嵌在消息区上方的一组简单按钮，既不支持来源切换，也没有“预览外部对话后再导入”的工作流。与此同时，扩展宿主当前的跨上下文通信只覆盖发送消息、鉴权和对比分析，协议定义位于 `apps/extension/src/utils/proxyProtocol.ts`，Background 实现位于 `apps/extension/entrypoints/background.ts`，尚未承载历史查询能力。

核心层中，`packages/core/src/interfaces/IStorageProvider.ts` 里定义了 `Conversation` 与 `IStorageProvider`，但 `Conversation` 目前只有 `backendId`，无法表达“来源于本地还是外部平台”以及“外部记录的原始 ID”。`packages/core/src/providers/ChatGPTWebProvider.ts` 也仅实现了消息发送，并未暴露历史列表与详情能力。

除此之外，当前模型选择链路仍然完全依赖 `packages/core/config.ts` 中静态写死的 `models/defaultModel`。`packages/ui/src/components/ProviderModelSelector.vue` 与 `packages/ui/src/components/CompareModelSelectors.vue` 都直接消费静态 `ProviderConfig[]`，这意味着 provider 自身的真实能力、账号可用模型和 UI 展示之间没有统一的运行时同步机制。

这次变更横跨 `packages/core`、`packages/ui`、`apps/extension` 三层，且涉及新抽象、数据模型扩展、Proxy 协议扩展和宿主主视图改造，适合先用设计文档固定技术边界。

## Goals / Non-Goals

**Goals:**

- 在扩展普通聊天视图中落地“左侧历史侧栏 + 右侧详情视图”的 master-detail 工作台。
- 让 UI 层只消费统一的线性 `Conversation` 数据，不感知 ChatGPT 原始树状历史结构。
- 为外部历史引入独立的 `IHistoryProvider` 契约，避免污染现有 `IModelProvider` 职责。
- 支持“查看外部历史详情 -> 导入本地 -> 立即继续追问”的闭环。
- 通过 `sourceType + externalId` 识别已导入记录，在外部列表中显示导入状态。
- 让普通聊天与对比聊天都从 provider 自身获取可用模型列表，而不是直接依赖静态配置。
- 保持 `IModelProvider` 作为统一 provider 入口，在不引入额外接口分层的前提下补充模型目录查询能力。

**Non-Goals:**

- 本阶段不实现全文搜索、收藏、标签、摘要提纯等更高阶 PKM 能力。
- 不在 `apps/web` 宿主中同步接入外部历史导入，先只落地浏览器扩展宿主。
- 不处理 ChatGPT 多分支对话的完整分叉浏览，只选择一条可渲染的主线消息链。
- 不引入新的远程存储或同步机制，导入后的持久化仍然只走现有本地存储。
- 本阶段不提供“手动刷新模型目录”按钮，也不在 UI 中展示更细粒度的模型能力矩阵。

## Decisions

### 决策 1：新增独立历史抽象，统一返回标准化 `Conversation`

**选择**

在 `packages/core/src/interfaces/IHistoryProvider.ts` 新增独立接口和历史摘要类型，并扩展 `packages/core/src/interfaces/IStorageProvider.ts` 中的 `Conversation`：

```ts
export type ConversationSourceType = 'local' | 'chatgpt_web';

export interface ConversationHistorySummary {
  id: string;
  title: string;
  updatedAt: number;
  sourceType: ConversationSourceType;
  isImported?: boolean;
}

export interface IHistoryProvider {
  id: string;
  getHistoryList(): Promise<ConversationHistorySummary[]>;
  getHistoryDetail(externalId: string): Promise<Conversation>;
}
```

`Conversation` 新增：

```ts
sourceType?: ConversationSourceType;
externalId?: string;
```

`getHistoryDetail` 的返回值直接使用标准化后的 `Conversation`，由 Provider 或其下游适配层负责把远端树状响应压平成线性消息数组。

**涉及文件**

- `packages/core/src/interfaces/IHistoryProvider.ts`：新增接口与历史摘要类型。
- `packages/core/src/interfaces/IStorageProvider.ts`：扩展 `Conversation` 元数据。
- `packages/core/src/index.ts`：导出新接口与类型。
- `packages/core/src/providers/ChatGPTWebProvider.ts`：补充历史查询方法或提取共享解析逻辑。

**原因**

- `IModelProvider` 的职责已经明确聚焦于鉴权、发消息、流式更新与中断；继续向其塞入历史查询会让接口语义变杂。
- 统一 `Conversation` 作为本地会话和外部预览的单一事实来源，可以直接复用现有消息渲染组件。
- 在数据进入 UI 之前完成“树转线性”，可以把外部平台数据结构隔离在 Provider/Background 层，形成防腐层。

**备选方案**

- 方案 A：在 `IModelProvider` 上直接加 `getHistoryList/getHistoryDetail`。缺点是模型发送能力与历史检索能力耦合，后续非聊天型来源接入会很别扭。
- 方案 B：把 ChatGPT 原始树结构直接返回给 UI。缺点是 UI 会被第三方接口细节绑定，后续扩展或测试成本都会上升。

### 决策 2：历史请求沿用现有 Proxy/Background 通道，但扩展新的 action 与响应载荷

**选择**

在现有 `apps/extension/src/utils/proxyProtocol.ts` 上新增历史动作：

```ts
export type ProxyAction =
  | 'CHECK_AUTH'
  | 'SEND_MESSAGE'
  | 'ANALYZE_COMPARISON'
  | 'ABORT'
  | 'GET_HISTORY_LIST'
  | 'GET_HISTORY_DETAIL';
```

新增请求与响应载荷：

```ts
export interface GetHistoryListRequest extends ProxyRequestBase {
  action: 'GET_HISTORY_LIST';
  providerId: string;
}

export interface GetHistoryDetailRequest extends ProxyRequestBase {
  action: 'GET_HISTORY_DETAIL';
  providerId: string;
  externalId: string;
}
```

历史列表和详情都通过 `DONE` 返回结果，列表结果为 `ConversationHistorySummary[]`，详情结果为 `Conversation`。Background 继续作为无状态路由，但新增历史 Provider 解析与 ChatGPT 详情标准化逻辑。

为避免污染 `BackgroundProxyProvider` 的模型职责，在 `apps/extension/src/utils/BackgroundHistoryProxy.ts` 新增专用代理类，实现 `IHistoryProvider` 并复用同一 `chrome.runtime.Port` 通道模型。

**涉及文件**

- `apps/extension/src/utils/proxyProtocol.ts`：扩展 action、请求和结果类型。
- `apps/extension/src/utils/BackgroundHistoryProxy.ts`：新增前端历史代理。
- `apps/extension/entrypoints/background.ts`：新增 `GET_HISTORY_LIST`、`GET_HISTORY_DETAIL` 的分支处理。
- `apps/extension/src/providerRuntime.ts`：新增扩展宿主历史 provider 创建入口，或导出 `createExtensionHistoryProvider()`。

**原因**

- 现有扩展宿主已经证明 `UI -> Proxy -> Background -> Real Provider` 这条路径可行；历史能力继续走同一通信模式，改动最集中。
- 使用单独的 `BackgroundHistoryProxy` 能避免把 `IHistoryProvider` 方法硬塞进 `BackgroundProxyProvider`，降低类型扭曲。
- 历史详情在 Background 内完成标准化，可直接利用扩展上下文已有的 Cookie/鉴权环境。

**备选方案**

- 方案 A：让 UI 直接请求 ChatGPT 历史接口。缺点是会重新暴露扩展跨域与 Cookie 限制问题，也违背现有宿主边界。
- 方案 B：在 `BackgroundProxyProvider` 上用可选方法混合实现历史接口。缺点是模型接口和历史接口在同一个类里长期会越来越难维护。

### 决策 3：保留 `NormalChatView` 与 `CompareChatView`，在更上层增加历史工作台容器

**选择**

采用“保留现有聊天视图，在其外层增加工作台容器”的策略。历史侧栏不直接塞进 `NormalChatView` 内部，而是在更上层新增一个 workspace view，统一管理左侧历史区与右侧内容区。右侧内容区按当前模式继续复用已有视图：

- 普通聊天模式：渲染 `NormalChatView`
- 对比聊天模式：渲染 `CompareChatView`
- 外部历史预览仍走普通聊天消息渲染路径，但只在普通聊天工作台下可进入预览态

其中 `NormalChatView` 保留现有职责：负责消息展示、输入、继续对话以及外部预览态下的“导入”按钮渲染；`CompareChatView` 继续负责对比聊天本身。历史侧栏、来源切换、当前右侧承载哪个 view，由更上层 workspace 容器决定。

UI 拆分为以下新增/修改文件：

- `packages/ui/src/views/ConversationWorkspaceView.vue`：新增 master-detail 布局容器，负责历史侧栏与右侧视图切换。
- `packages/ui/src/components/ConversationSidebar.vue`：左侧可折叠侧栏，支持本地/外部来源切换。
- `packages/ui/src/views/NormalChatView.vue`：保留为右侧普通聊天视图，并在预览态时直接在现有底部区域渲染导入按钮而非发送输入框。
- `packages/ui/src/views/CompareChatView.vue`：由 workspace 容器继续承载，不在本次变更中拆散原职责。
- `packages/ui/src/store/chat.ts`：扩展历史工作台状态。

`chat.ts` 需要新增的核心状态与方法：

```ts
historyProvider: IHistoryProvider | null;
historySource: 'local' | 'external';
workspaceMode: 'active' | 'preview';
sidebarCollapsed: boolean;
externalHistoryItems: ConversationHistorySummary[];
previewConversation: Conversation | null;

setHistoryProvider(provider: IHistoryProvider): void;
loadLocalConversations(): Promise<void>;
loadExternalHistory(): Promise<void>;
previewExternalConversation(externalId: string): Promise<void>;
importPreviewConversation(): Promise<void>;
selectLocalConversation(id: string): Promise<void>;
```

主视图渲染规则：

- 左侧总是显示当前来源的历史列表。
- 右侧内容区根据宿主当前模式决定挂载 `NormalChatView` 或 `CompareChatView`。
- `workspaceMode === 'preview'` 时，仅普通聊天区域进入只读预览态；导入按钮直接放在 `NormalChatView` 现有底部操作区。
- `workspaceMode === 'active'` 时，`NormalChatView` 恢复正常输入区；`CompareChatView` 保持既有交互。

**涉及文件**

- `packages/ui/src/views/ConversationWorkspaceView.vue`
- `packages/ui/src/store/chat.ts`
- `packages/ui/src/components/ConversationSidebar.vue`
- `packages/ui/src/views/NormalChatView.vue`
- `packages/ui/src/views/CompareChatView.vue`
- `apps/extension/src/App.vue`

**原因**

- 历史侧栏属于更高一层的宿主工作台能力，不应把它绑定死在普通聊天视图中，否则后续对比聊天历史接入时还得再次拆分。
- `NormalChatView` 和 `CompareChatView` 已经是稳定的业务视图，保持它们作为右侧内容视图，能降低本次改动对现有交互的破坏。
- 外部预览态与活动态的差别主要体现在底部操作区，直接在 `NormalChatView.vue` 内切换“发送区 / 导入按钮”更简单，不必额外引入 `ConversationImportBar.vue`。

**备选方案**

- 方案 A：把侧栏直接塞进 `NormalChatView`。缺点是会让普通聊天视图承担宿主级布局职责，后续对比聊天历史接入时结构会再次重做。
- 方案 B：为导入按钮单独拆出 `ConversationImportBar.vue`。优点是组件更独立；缺点是当前交互很薄，拆分收益不足，先以内联方式保持简单。

### 决策 4：已导入判定不新增存储接口，优先复用 `getAllConversations()` 建立本地索引

**选择**

本阶段不修改 `IStorageProvider` 方法签名，而是要求存储实现完整保留新增的 `sourceType` 与 `externalId` 字段。外部历史列表的“已导入”状态通过以下流程派生：

1. `chatStore.init()` 或 `loadLocalConversations()` 读取 `getAllConversations()`。
2. 在内存中构建 `Set<string>`，键格式为 `${sourceType}:${externalId}`。
3. `loadExternalHistory()` 拉取远端摘要后，为命中该索引的项标记 `isImported = true`。

`importPreviewConversation()` 保存导入后的 `Conversation` 时，强制写入：

```ts
sourceType: 'chatgpt_web'
externalId: <remote conversation id>
```

如果发现本地已存在同一 `sourceType + externalId`，则不重复创建新记录，而是直接切换到该本地会话。

**涉及文件**

- `packages/core/src/interfaces/IStorageProvider.ts`
- `packages/core/src/providers/IndexedDBStorageProvider.ts`
- `packages/ui/src/store/chat.ts`
- `apps/extension/src/persistence/saveCompareConversation.ts`

**原因**

- 现有存储抽象足够完成本阶段目标，新增 `findByExternalId` 之类接口会扩大改动面，并要求所有宿主同步适配。
- 导入判重规模目前受限于本地会话量，先以内存索引实现，复杂度最低。

**备选方案**

- 方案 A：为 `IStorageProvider` 增加 `findConversationByExternalId(sourceType, externalId)`。优点是查询更直接；缺点是接口扩散更大，现阶段收益不高。
- 方案 B：单独维护一张“导入映射表”。缺点是会引入双写一致性问题，没有必要。

### 决策 5：ChatGPT 历史详情在 Background 中做主链提取，只保留可连续追问的线性会话

**选择**

`packages/core/src/providers/ChatGPTWebProvider.ts` 需要新增内部方法，用于请求历史列表与详情，并暴露一个“详情标准化”能力给 Background 使用。标准化规则如下：

- 历史列表从 ChatGPT 历史接口读取 `id/title/update_time`，映射为 `ConversationHistorySummary`。
- 首版只读取前 1 页历史结果，不做跨页合并或无限滚动。
- 历史详情从根节点开始，沿默认主分支或当前节点链提取用户/助手消息。
- 过滤 system/tool/空内容节点，只保留 UI 目前支持的 `user` 和 `assistant`。
- 生成的 `Conversation` 中：
  - `id` 使用新的本地 UUID，仅用于预览态临时渲染。
  - `externalId` 使用 ChatGPT 原始 `conversation_id`。
  - `backendId` 也保存为该 `conversation_id`，便于导入后继续追问时直接复用上下文。
  - `sourceType` 固定为 `chatgpt_web`。

**涉及文件**

- `packages/core/src/providers/ChatGPTWebProvider.ts`
- `apps/extension/entrypoints/background.ts`
- `apps/extension/tests/e2e/extension-host.spec.ts`

**原因**

- 用户的主要目标是“把历史拉进来继续问”，不是完整查看 ChatGPT 的多分支编辑树，因此线性主链足够支撑首版闭环。
- 首版先读取第 1 页历史，可以尽快验证导入链路，避免把分页抓取、滚动加载和去重一起耦合进第一次落地。
- 将 `backendId` 对齐为远端 `conversation_id`，可以减少导入后继续对话时的上下文衔接成本。

**备选方案**

- 方案 A：保留所有分支并在 UI 中暴露分支切换。缺点是大幅放大范围，不符合第六阶段目标。
- 方案 B：导入时丢弃 `backendId`，只保留文本内容。缺点是导入后无法自然续聊，损失本需求核心价值。

### 决策 6：模型目录能力直接并入 `IModelProvider`，不新增独立 catalog 接口

**选择**

在 `packages/core/src/interfaces/IModelProvider.ts` 上直接新增：

```ts
getAvailableModels(): Promise<{
  models: ModelConfig[];
  defaultModel: string;
}>;
```

所有 provider 都实现该方法；如果 provider 无法在线动态探测，也必须返回自身当前支持的模型列表。静态配置中的 `models/defaultModel` 保留为 fallback，而不再作为 UI 正常路径下的最终来源。与此同时，`ProviderConfig` 允许声明一个偏好的默认模型标识或名称，由 runtime 在动态模型目录返回后进行匹配。

**涉及文件**

- `packages/core/src/interfaces/IModelProvider.ts`
- `packages/core/config.ts`
- `packages/core/src/runtime/types.ts`
- `packages/core/src/runtime/createProviderRuntime.ts`
- `packages/core/src/providers/ChatGPTWebProvider.ts`
- `packages/core/src/providers/GeminiApiProvider.ts`
- `packages/core/src/testing/createMockRuntime.ts`

**原因**

- 普通聊天、对比聊天、extension proxy 当前都把 provider 视为统一入口；直接并入 `IModelProvider` 可以最小化调用点改动。
- 用户已经明确不希望新增 `IModelCatalogProvider` 这样的额外抽象层。
- 对 `gemini-api`、mock provider 来说，实现一个统一的 `getAvailableModels()` 比为不同能力接口做额外适配更直接。

**备选方案**

- 方案 A：新增 `IModelCatalogProvider`。优点是职责更干净；缺点是引入额外抽象层，runtime 和 proxy 需要做更多类型分支，与当前架构不匹配。
- 方案 B：继续让 UI 直接读取静态配置。缺点是 provider 实际能力与 UI 展示会持续漂移，尤其不适合 `chatgpt-web`。

### 决策 7：runtime 负责以 provider 动态结果覆盖静态模型目录，并在失败时回退

**选择**

`ProviderRuntime` 继续暴露 provider catalog，但新增运行时模型查询能力，例如：

```ts
getProviderCatalog(): ProviderConfig[];
getProviderModels(providerId: string): Promise<{
  models: ModelConfig[];
  defaultModel: string;
}>;
```

运行时查询逻辑为：

1. 读取静态 provider 元数据作为基线。
2. 调用对应 provider 的 `getAvailableModels()`。
3. 若静态配置中声明了偏好的默认模型，则 runtime 先在动态结果中按 `id/name` 及归一化后的字符串进行匹配，并覆写 `defaultModel`。
4. 若偏好的默认模型未命中动态模型目录，则抛出显式错误，不允许静默回退。
5. 只有 provider 查询本身失败时才回退到静态配置。
6. 同一 runtime 生命周期内缓存模型目录，避免重复查询。

**涉及文件**

- `packages/core/src/runtime/types.ts`
- `packages/core/src/runtime/createProviderRuntime.ts`
- `packages/ui/src/store/chat.ts`
- `packages/ui/src/store/compare.ts`
- `apps/web/src/App.vue`
- `apps/extension/src/App.vue`

**原因**

- 模型目录的最终来源应当由 provider 决定，但宿主和 UI 仍需要一个稳定的 fallback，避免 provider 查询失败时页面空白。
- 默认模型偏好是产品配置，不是 provider 返回值本身；这层覆盖应由 runtime 统一处理，避免 UI 和 provider 各自维护一套选择逻辑。
- 运行时缓存可以避免重复打到 ChatGPT 或其他 provider 的能力探测接口。
- 让 runtime 层承担合并逻辑，可以避免 chat/compare 两个 store 自己复制一份 fallback 规则。

**备选方案**

- 方案 A：每个 store 直接调 provider 并做 fallback。缺点是普通聊天和对比聊天会出现重复逻辑，且更难统一测试。
- 方案 B：只保留动态结果，不做静态回退。缺点是 provider 查询失败时会直接阻塞聊天入口。

### 决策 8：extension 下的模型目录查询沿用现有 Proxy/Background 通道

**选择**

在现有 extension proxy 协议上新增 `GET_AVAILABLE_MODELS`，由 `BackgroundProxyProvider` 透传到 Background，再由真实 provider 执行 `getAvailableModels()` 并回包：

```ts
export interface GetAvailableModelsRequest extends ProxyRequestBase {
  action: 'GET_AVAILABLE_MODELS';
  providerId: string;
}
```

`DONE.result` 新增模型目录载荷：

```ts
{
  models: ModelConfig[];
  defaultModel: string;
}
```

**涉及文件**

- `apps/extension/src/utils/proxyProtocol.ts`
- `apps/extension/src/utils/BackgroundProxyProvider.ts`
- `apps/extension/entrypoints/background.ts`
- `apps/extension/src/providerRuntime.ts`

**原因**

- extension 宿主当前所有真实 provider 调用都必须经由 Background，模型目录查询也应保持同一路径。
- 这样 `chatgpt-web` 可以在有 Cookie/鉴权上下文的地方完成模型探测，而不是让 UI 端直接推测。
- 与历史链路一样，沿用 request correlation 机制可以避免并发串线。

**备选方案**

- 方案 A：让 extension UI 直接调用 `chatgpt-web` 的模型接口。缺点是会再次碰到跨域与 Cookie 作用域问题。
- 方案 B：在宿主启动时直接硬编码模型目录。缺点是无法反映 provider 当前真实能力。

### 决策 9：UI 在 provider 切换后等待动态模型目录结果，再开放模型下拉

**选择**

普通聊天和对比聊天都采用“provider 先可见，模型列表等待动态结果后再渲染”的策略：

- 页面启动时先加载 provider catalog。
- 选定默认 provider 后异步加载其模型目录。
- 模型目录未到达前，模型下拉显示加载态并禁用。
- runtime 产出的 `defaultModel` 已经包含静态偏好默认模型匹配逻辑。
- 若当前选中的 model 已不在新目录中，自动回退到 runtime 最终产出的 `defaultModel`。
- 若静态配置要求的偏好默认模型不存在于当前动态目录中，UI 必须显示错误而不是静默继续使用旧值或 fallback。

对比聊天的 A/B 两侧模型目录分别加载，互不影响。

**涉及文件**

- `packages/ui/src/store/chat.ts`
- `packages/ui/src/store/compare.ts`
- `packages/ui/src/components/ProviderModelSelector.vue`
- `packages/ui/src/components/CompareModelSelectors.vue`
- `packages/ui/src/views/NormalChatView.vue`
- `packages/ui/src/views/CompareChatView.vue`

**原因**

- 用户已经明确希望第一版等待 provider 自身能力结果，而不是先展示静态模型再刷新。
- 这样可以避免用户在模型列表刷新前选中一个稍后失效的静态 model，导致状态跳变。
- A/B 独立加载能保留对比聊天的双列交互稳定性。

**备选方案**

- 方案 A：先渲染静态模型再刷新。优点是首屏更快；缺点是 UI 会出现短暂漂移，与本次目标相反。
- 方案 B：只有在切换 provider 时再请求模型目录。缺点是对比聊天初始化时需要两侧额外补齐异步状态，交互更割裂。

## Risks / Trade-offs

- [风险] ChatGPT 历史详情的数据结构可能与预期不同，导致主链提取失败。→ 缓解：先为标准化函数补单测，覆盖空节点、分支节点、缺失标题等场景。
- [风险] `chat` store 职责扩大后，状态复杂度上升。→ 缓解：把宿主级历史布局收敛到 `ConversationWorkspaceView`，并把历史相关方法集中命名，避免 `NormalChatView` 和 `CompareChatView` 被过度侵入。
- [风险] 使用 `getAllConversations()` 做导入去重在本地数据量大时会变慢。→ 缓解：首版接受该成本，若后续历史量增大，再为存储层补索引接口。
- [风险] 预览态与活动态共用一套消息渲染，可能引入“误发送到外部预览”的边界问题。→ 缓解：发送入口严格受 `workspaceMode === 'active'` 保护，预览态不渲染输入框。
- [风险] 导入后直接沿用 `backendId` 继续追问，可能遇到远端会话已失效。→ 缓解：发送失败时保留本地导入内容并提示用户从该记录开启新会话。
- [风险] 首版只读取 ChatGPT 历史第 1 页，用户可能看不到更早记录。→ 缓解：在侧栏文案中明确当前只展示最近历史，并为后续分页扩展保留协议字段。
- [风险] provider 动态模型目录查询失败会导致模型选择器不可用。→ 缓解：runtime 仅在查询失败时回退到静态 `models/defaultModel`，并在 UI 中保留加载失败后的兜底选择。
- [风险] 配置的偏好默认模型与真实动态模型目录不一致，会导致启动时报错。→ 缓解：将该情况视为显式配置错误，直接暴露错误信息，避免用户在未知默认模型下继续操作。
- [风险] 对比聊天需要同时维护 A/B 两套异步模型状态，可能引入相互覆盖。→ 缓解：compare store 为 A/B 分别存储模型目录与加载态，不共享当前 model 状态。

## Migration Plan

1. 先扩展 `packages/core` 的 `Conversation` 与 `IHistoryProvider`，保证类型出口稳定。
2. 在 `apps/extension` 中扩展 Proxy 协议和 Background 处理，但先只打通历史列表/详情的 mock 或最小真实请求。
3. 新增 `packages/ui/src/views/ConversationWorkspaceView.vue`，并改造 `packages/ui/src/store/chat.ts`、`packages/ui/src/views/NormalChatView.vue`，先让本地侧栏和活动态跑通。
4. 接入外部历史预览与导入逻辑，完成“预览 -> 导入 -> 继续追问”闭环。
5. 补充 provider 动态模型目录链路：扩展 `IModelProvider`、runtime、proxy/background、普通聊天与对比聊天选择器。
6. 为扩展宿主补充 e2e：本地历史展示、外部预览、已导入标识、导入后继续发送，以及普通/对比视图在 workspace 容器中的切换。

回滚策略：

- 如果历史导入链路不稳定，可只保留本地侧栏与会话切换，关闭“外部导入”数据源入口。
- Proxy 协议扩展是增量式的，移除 `GET_HISTORY_LIST/DETAIL` 分支即可回退，不影响既有消息发送链路。

## Open Questions

- ChatGPT 历史列表分页协议是否需要在首版请求结构中预留 `page/cursor` 字段，还是等第二阶段再扩展。
- “已导入”状态是否只针对完整导入的记录，还是将来允许部分导入/更新覆盖。
- 导入后的标题是否始终沿用远端标题，还是在首次继续追问后允许按本地规则自动重命名。
- provider 动态模型目录是否需要后续提供手动刷新入口，还是继续依赖 runtime 生命周期内缓存。
