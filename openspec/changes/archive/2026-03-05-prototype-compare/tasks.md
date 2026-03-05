## 1. 核心配置与运行时能力

- [x] 1.1 扩展 `packages/core/config.ts`，新增 `AnalyzerConfig` 与 `APP_CONFIG.analyzer`，补齐 `{prompt}`、`{outputA}`、`{outputB}` 占位符模板。
- [x] 1.2 修改 `packages/core/src/runtime/types.ts` 与 `packages/core/src/runtime/createProviderRuntime.ts`，为 `getProvider` 增加 `fresh` 选项并保留默认缓存行为。
- [x] 1.3 为 runtime 新增/更新单元测试，覆盖 `fresh: true` 返回独立实例、默认模式返回缓存实例的行为。

## 2. 分析引擎与并发控制器

- [x] 2.1 新增 `packages/core/src/analysis/types.ts`，定义 `AnalysisResult` 五字段结构。
- [x] 2.2 新增 `packages/core/src/analysis/ComparisonAnalyzer.ts`，实现提示词替换、流式透传、以原文摘录为主的结果约束、最终 JSON/Markdown JSON 解析与错误抛出。
- [x] 2.3 新增 `packages/core/src/workflows/CompareWorkflowController.ts`，实现 A/B 并发执行、双路完成后触发分析、生命周期状态输出。
- [x] 2.4 更新 `packages/core/src/index.ts` 导出 analyzer 与 compare workflow 能力，并补充对应测试用例。

## 3. UI 对比模式状态与组件

- [x] 3.1 新增 `packages/ui/src/store/compare.ts`，管理 `outputA/outputB/analysisRaw/analysisResult/activeTab/hasAnalysisStartedStreaming` 状态与动作。
- [x] 3.2 新增 `packages/ui/src/components/CompareModelSelectors.vue`，实现 A/B 双 Provider+Model 选择器联动且互不干扰。
- [x] 3.3 新增 `packages/ui/src/components/AnalysisGrid.vue`，按 3 行 2 列固定映射渲染 `agreements/conflictsA/conflictsB/uniqueA/uniqueB`，展示原答案原文摘录而非评论。
- [x] 3.4 新增 `packages/ui/src/views/CompareChatView.vue`，实现粘性头部、Tab 面板、可滚动内容区、底部输入区与首字自动切页逻辑，并在原生输出中支持 Markdown 渲染。
- [x] 3.5 新增 `packages/ui/src/views/NormalChatView.vue`（或迁移 `ChatApp.vue`），保持现有单聊能力不回归，并支持助手 Markdown 原生渲染。
- [x] 3.6 更新 `packages/ui/index.ts` 导出新视图与 compare store，确保宿主可直接接入。

## 4. Web 宿主路由接入

- [x] 4.1 在 `apps/web/src` 新增路由定义（如 `router.ts`），提供普通聊天与对比聊天入口。
- [x] 4.2 修改 `apps/web/src/main.ts` 与 `apps/web/src/App.vue`，接入路由视图与入口导航，保持现有 ProviderRuntime/Storage 注入流程可复用。
- [x] 4.3 验证刷新恢复行为：在普通聊天和对比聊天入口分别刷新后仍保持对应视图。

## 5. 端到端验证与回归

- [x] 5.1 手工验证双模型并发输出：A/B 两列流式更新互不串流，完成后自动进入分析阶段。
- [x] 5.2 手工验证分析体验：首个分析 chunk 到达时自动切换到“深度剖析”，最终渲染为对称 3x2 网格，且内容为原文摘录优先。
- [x] 5.3 手工验证异常路径：分析 JSON 解析失败时展示降级错误态，且可切回“原生输出”继续查看。
- [x] 5.4 执行并记录基础回归（单聊发送、历史会话、Provider/Model 切换）确保未引入现有功能回退。

## 6. E2E 自动化测试（Playwright）

- [x] 6.1 在 `apps/web` 初始化 Playwright 测试框架配置（含 `playwright.config`、测试目录与基础启动脚本）。
- [x] 6.2 编写普通聊天路径 E2E 用例：覆盖发送消息、流式响应展示与历史会话恢复。
- [x] 6.3 编写对比聊天路径 E2E 用例：覆盖 A/B 并发输出、首字触发自动切换到“深度剖析”Tab、3x2 分析网格渲染，以及原生输出 Markdown 渲染。
- [x] 6.4 编写异常与降级 E2E 用例：覆盖分析返回异常/不可解析时的错误提示与回退到“原生输出”可用性，并覆盖 Markdown 代码块 JSON 与数组字段兼容解析。
- [x] 6.5 集成并执行 E2E 流程：将 Playwright 测试命令接入项目脚本并输出测试报告（本地可复现）。
