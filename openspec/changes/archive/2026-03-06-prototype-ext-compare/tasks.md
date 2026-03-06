## 1. Manifest 与全窗口入口

- [x] 1.1 更新 `apps/extension/wxt.config.ts`，移除 sidepanel/popup 相关声明并补充 `tabs` 权限。
- [x] 1.2 在 `apps/extension/entrypoints/background.ts` 增加 `chrome.action.onClicked` 监听，点击图标打开 `chrome.runtime.getURL('index.html')` 新标签页。
- [x] 1.3 新增全窗口入口文件（`apps/extension/entrypoints/index.html`、`apps/extension/entrypoints/index/main.ts`）并完成 Vue + Pinia 挂载。

## 2. Extension 宿主壳层与运行时注入

- [x] 2.1 重构 `apps/extension/src/App.vue` 为宿主壳层，复用 `AppTopBar` 与 `CHAT_ROUTES` 支持普通/对比模式切换。
- [x] 2.2 新增 `apps/extension/src/router.ts`，实现与 web 一致的路由状态与 hash 同步逻辑。
- [x] 2.3 新增 `apps/extension/src/providerRuntime.ts`，构建 extension 专用 proxy runtime 并按 `runtimeMode='extension'` 过滤可用 Provider。
- [x] 2.4 在 extension 宿主初始化中同时注入 `useChatStore` 与 `useCompareStore` 所需依赖（model resolver、runtime、storage）。

## 3. Proxy 协议与后台并发路由

- [x] 3.1 新增 `apps/extension/src/utils/proxyProtocol.ts`，定义包含 `requestId/channelId/action` 的前后台消息协议类型。
- [x] 3.2 升级 `apps/extension/src/utils/BackgroundProxyProvider.ts`：支持按请求标识订阅回包、并发请求隔离、按请求中止。
- [x] 3.3 重构 `apps/extension/entrypoints/background.ts` 消息分发：分别处理 `checkAuth`、`sendMessage`、`ANALYZE_COMPARISON`、`abort`。
- [x] 3.4 在 Background 中接入 `ComparisonAnalyzer` 分析链路并将分析流按请求标识透传回前端。

## 4. 对比会话持久化与数据契约

- [x] 4.1 扩展 `packages/core/src/interfaces/IStorageProvider.ts` 的 `Conversation` 类型，新增可选 compare 结构（prompt、A/B 输出、analysisResult）。
- [x] 4.2 在 extension 宿主新增对比会话保存逻辑（建议新增 `apps/extension/src/persistence/saveCompareConversation.ts`）。
- [x] 4.3 接入对比完成态持久化与页面重开恢复流程，确保旧会话数据兼容读取不报错。

## 5. 测试与回归（Playwright）

- [x] 5.1 新增 Playwright E2E：验证点击插件图标会打开 extension 全窗口页面，并默认可进入普通聊天视图。
- [x] 5.2 新增 Playwright E2E：验证 extension 中普通/对比模式切换、双 Provider/Model 选择器独立联动。
- [x] 5.3 新增 Playwright E2E：验证对比流程下 A/B 并发输出、分析首字触发切换到分析 Tab、3x2 网格渲染。
- [x] 5.4 新增 Playwright E2E：验证中止仅影响目标请求，分析失败时可降级并可切回原生输出。
- [x] 5.5 新增 Playwright E2E：验证对比会话（含分析结果）落盘并在刷新/重开后可恢复。
