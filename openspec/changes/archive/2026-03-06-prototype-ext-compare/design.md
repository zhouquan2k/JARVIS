## Context

`prototype-compare` 已在 `apps/web` 完成双模型并发、分析流式、首字切页与 3x2 分析网格，但 `apps/extension` 仍停留在单视图 `ChatApp`（普通聊天），且宿主入口依赖 sidepanel 形态。  
`phase-5.md` 要求第五阶段将对比能力无缝装载到插件宿主，并将入口改为“点击插件图标打开全窗口标签页”，同时通过 `chrome.runtime.connect` 打通前端与 Background 的代理通信链路。  
约束如下：
- 不修改 `packages/ui` 的组件实现（可复用已有视图与 store）。
- 继续使用现有 Provider 抽象与 Background 代理，不引入新模型 SDK。
- 需要支持对比链路的双路并发流 + 分析流，并保证可中止、可降级。

## Goals / Non-Goals

**Goals:**
- 在 extension 宿主提供与 web 一致的普通/对比双视图体验（包含顶部切换、对比执行与分析展示）。
- 将扩展入口切换为全窗口标签页，点击插件图标即可打开。
- 升级 Background 代理协议，使 A/B 生成流和分析流具备可隔离、可追踪、可中止的通道语义。
- 保持 extension 运行时 Provider 注入与过滤逻辑一致（仅暴露 `runtimeMode=extension` 可用 Provider）。
- 在 extension 侧落盘对比结果，保证双模型输出与分析结果可恢复。

**Non-Goals:**
- 不重写 `packages/ui` 现有组件（如 `CompareChatView.vue`、`NormalChatView.vue`）的布局与交互。
- 不引入新的外部推理引擎或消息总线中间件。
- 不在本阶段处理跨浏览器（Firefox/Safari）差异化适配。
- 不改变 web 宿主既有路由与运行时实现。

## Decisions

### 决策 1：扩展入口改为全窗口标签页，而非 sidepanel/popup

**选择**  
通过 `chrome.action.onClicked` 在 Background 中打开扩展页面（全窗口 tab），宿主主界面改为该页面承载。

**涉及文件**
- `apps/extension/wxt.config.ts`
- `apps/extension/entrypoints/background.ts`
- `apps/extension/entrypoints/index.html`（新增，全窗口入口）
- `apps/extension/entrypoints/index/main.ts`（新增，全窗口入口脚本）

**签名/接口变化**
- 新增 Background 事件处理：
  - `chrome.action.onClicked.addListener(() => void)`

**变更说明**
- Manifest 移除 sidepanel/popup 相关声明，补充 `tabs` 权限用于创建标签页。
- Action 点击时打开 `chrome.runtime.getURL('index.html')`。

**备选方案**
- 继续使用 sidepanel：实现成本低，但无法满足 phase-5 的“全窗口接管”要求。
- 使用 popup：空间受限，不适合对比双栏与分析网格长内容场景。

---

### 决策 2：extension 宿主复用 UI 路由能力，构建双视图壳层

**选择**  
在 `apps/extension/src/App.vue` 采用与 web 宿主一致的壳层结构：`AppTopBar + route host`，在宿主层切换 `NormalChatView/CompareChatView`，不修改 UI 组件本体。

**涉及文件**
- `apps/extension/src/App.vue`（重构）
- `apps/extension/src/router.ts`（新增）
- `apps/extension/entrypoints/index/main.ts`（挂载新 App）

**签名/接口变化**
- 新增路由辅助函数（宿主本地）：
  - `navigateTo(path: ChatRoutePath): void`
  - `isRouteActive(path: ChatRoutePath): boolean`

**变更说明**
- 入口由单一 `<ChatApp />` 改为可切换普通/对比模式的宿主壳层。
- 继续复用 `packages/ui` 导出的 `CHAT_ROUTES`、`AppTopBar`、`NormalChatView`、`CompareChatView`。

**备选方案**
- 直接在 extension 复刻一套对比页面：会与 `packages/ui` 分叉，维护成本高，不符合复用目标。

---

### 决策 3：引入 extension 专用 Proxy Runtime，统一注入 chat/compare store

**选择**  
在 extension 宿主侧新增 `ProviderRuntime` 适配层，`getProvider()` 返回 `BackgroundProxyProvider` 实例；`getAvailableProviders()` 复用 `APP_CONFIG.providers + runtimeMode=extension` 过滤。

**涉及文件**
- `apps/extension/src/providerRuntime.ts`（新增）
- `apps/extension/src/App.vue`（接入 `useChatStore` 与 `useCompareStore`）
- `apps/extension/src/utils/BackgroundProxyProvider.ts`（增强）

**签名/接口变化**
- 新增 runtime 构建函数：
  - `createExtensionProxyRuntime(): ProviderRuntime`
- `BackgroundProxyProvider` 构造参数增强：
  - `constructor(providerId: string, options?: { channelId?: string })`

**变更说明**
- `chatStore`：通过 `setModelProviderResolver` 按 providerId 获取代理实例。
- `compareStore`：通过 `setRuntime` 使用统一 runtime，保留 `fresh` 实例语义，避免 A/B 流冲突。

**备选方案**
- 直接在 extension 前端实例化真实 Provider：会把宿主耦合到实现细节，且不满足“后台代理通信集成”目标。

---

### 决策 4：升级 Background 代理协议为“请求可关联”的多流协议

**选择**  
在 `chrome.runtime.connect` 通道上引入 `requestId/channelId`，将 `send/checkAuth/abort` 与分析请求统一为可关联消息；Background 按请求维度路由回包，保证并发安全。

**涉及文件**
- `apps/extension/src/utils/BackgroundProxyProvider.ts`
- `apps/extension/entrypoints/background.ts`
- `apps/extension/src/utils/proxyProtocol.ts`（新增，协议类型定义）

**签名/接口变化**
- 新增协议类型：
  - `type ProxyRequest = ...`
  - `type ProxyResponse = ...`
- Background 新增处理函数：
  - `handleSendMessage(req: SendMessageRequest, port: chrome.runtime.Port): Promise<void>`
  - `handleAnalyzeComparison(req: AnalyzeComparisonRequest, port: chrome.runtime.Port): Promise<void>`
  - `handleAbort(req: AbortRequest): void`

**变更说明**
- 通过 `requestId` 绑定一次请求的 update/done/error。
- 通过 `channelId` 区分 A/B/analysis 三类流，避免消息串流。
- `abort` 可指定目标请求，避免误中止其他并发流。

**备选方案**
- 维持当前“按 port 粗粒度隔离”：在多请求并发与复用连接场景下可观测性不足，调试成本高。

---

### 决策 5：分析执行放在 Background，前端只消费分析流

**选择**  
UI 在 A/B 完成后发送 `ANALYZE_COMPARISON` 指令（携带 `prompt/outputA/outputB`）；Background 内部实例化 `ComparisonAnalyzer` 和真实运行时 Provider 执行分析并流式回传。

**涉及文件**
- `apps/extension/entrypoints/background.ts`
- `packages/core/src/analysis/ComparisonAnalyzer.ts`（复用，不改核心算法）
- `apps/extension/src/utils/BackgroundProxyProvider.ts`

**签名/接口变化**
- Background 分析入口：
  - `analyzeComparison(payload: { prompt: string; outputA: string; outputB: string; analyzerProviderId?: string; analyzerModelId?: string }, onUpdate: (chunk: string) => void): Promise<AnalysisResult>`

**变更说明**
- 分析请求生命周期与普通对话请求统一走代理协议。
- 便于后续将密钥与执行边界收敛在 Background 层，前端不感知分析实现细节。

**备选方案**
- 前端直接调用 `ComparisonAnalyzer`：实现更短，但执行边界分散，不符合 phase-5 的“后台分析集成”方向。

---

### 决策 6：扩展 Conversation 数据契约以持久化对比结果

**选择**  
在核心存储接口中为对比模式新增可选字段，保证 extension 全窗口模式下可以恢复 prompt、A/B 输出和分析结果。

**涉及文件**
- `packages/core/src/interfaces/IStorageProvider.ts`
- `packages/core/src/providers/IndexedDBStorageProvider.ts`（兼容读取/写入）
- `apps/extension/src/persistence/saveCompareConversation.ts`（新增）
- `apps/extension/src/App.vue`（在对比完成时触发落盘）

**签名/接口变化**
- `Conversation` 新增可选字段（兼容旧数据）：
  - `compare?: { prompt: string; modelAProviderId: string; modelAModelId: string; modelBProviderId: string; modelBModelId: string; outputA: string; outputB: string; analysisResult: AnalysisResult; analysisRaw?: string }`

**变更说明**
- 采用“可选 compare 字段”保持向后兼容，普通聊天数据无感。
- extension 宿主在对比完成后将当前轮结果写入 IndexedDB。

**备选方案**
- 不扩展数据契约，仅内存态展示：重开页面后丢失对比结果，无法满足阶段目标。

## Risks / Trade-offs

- [Risk] `requestId/channelId` 协议升级会影响现有代理兼容性  
  → Mitigation：协议按版本兼容，旧消息格式仍可在过渡期解析；优先补单测覆盖消息编解码。

- [Risk] 全窗口入口切换后，用户旧习惯（sidepanel）路径变化  
  → Mitigation：保留短期回滚开关（恢复 sidepanel 配置 + 关闭 onClicked 劫持）。

- [Risk] 分析在 Background 执行会增加 Service Worker 生命周期复杂度  
  → Mitigation：分析请求按单次任务创建/清理资源；异常统一回传 error 并在 UI 降级显示。

- [Risk] Conversation 数据结构扩展可能影响历史记录读取逻辑  
  → Mitigation：字段全部可选，读取端先判空；为旧数据增加兼容测试样例。

- [Risk] extension 全窗口与 web 行为仍可能出现细微差异  
  → Mitigation：新增跨宿主对比基线测试（视图切换、首字切页、错误降级、停止行为）。

## Migration Plan

1. 新增全窗口 entrypoint（`entrypoints/index.html` 与 `entrypoints/index/main.ts`），并保留现有 sidepanel 产物作为临时回退路径。  
2. 升级 Background：先引入新协议解析与 `onClicked` 打开页面逻辑，再接入分析请求处理。  
3. 在 extension App 接入 proxy runtime 与双 store 初始化，完成普通/对比模式切换。  
4. 增加对比结果落盘流程并验证历史恢复。  
5. 执行回归测试（普通聊天、对比流程、并发中止、分析失败降级）。  
6. 稳定后移除 sidepanel 相关入口与冗余配置。  

**Rollback**
- 回滚到 sidepanel 模式：恢复 manifest sidepanel 配置、移除 `chrome.action.onClicked` 监听、入口挂回 `entrypoints/sidepanel`。
- 协议回滚：Background 同时支持旧 `sendMessage/checkAuth/abort` 报文，前端切回旧代理实现即可。

## Open Questions

- `index.html` 命名是否作为长期固定入口，还是保留 `sidepanel.html` 并仅改变打开方式？  
- `ANALYZE_COMPARISON` 是否必须强制走 Background，还是允许在开发态回退到前端执行以便调试？  
- 扩展端 Gemini 凭据来源优先级是否统一为 `chrome.storage.local > env`？需要明确安全策略与兜底行为。  
- 对比结果落盘后，历史列表是否需要新增“对比会话”视觉标识（本阶段可能仅存储不改 UI 表现）。  
