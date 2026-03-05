## Context

当前实现以单会话、单模型主流程为中心：`ChatApp.vue` + `chat` store 只维护一组 Provider/Model 选择和一条流式输出链路。第四阶段要求同时满足三件事：双模型并发输出、分析引擎流式提取答案原文、以及分析首字到达即自动切页。该变更横跨 `packages/core`（运行时与引擎）和 `packages/ui`/`apps/web`（视图与交互编排），属于典型跨模块架构升级。

## Goals / Non-Goals

**Goals:**
- 增加独立对比视图，并与普通聊天视图形成可路由切换的双视图结构。
- 在核心层提供可复用的并发执行控制器和分析引擎，避免把业务逻辑耦合进 Vue 组件。
- 支持分析流首 chunk 触发 UI 自动切换到“深度剖析”Tab。
- 产出稳定的结构化分析结果（`agreements/conflictsA/conflictsB/uniqueA/uniqueB`）并渲染为对称网格，字段内容优先保留原答案原文摘录。

**Non-Goals:**
- 不在本阶段引入多轮对比会话时间线或版本回放。
- 不改造现有 Provider 协议为多模态输入（图片、文件）协议。
- 不实现跨端统一路由（仅保证 web 宿主先落地）。

## Decisions

### Decision 1: 扩展静态配置，新增分析引擎配置节点
- 文件：
  - `packages/core/config.ts`（修改）
- 函数/类型签名变更：
  - `export interface AnalyzerConfig { defaultProvider: string; defaultModel: string; systemPrompt: string }`
  - `export const APP_CONFIG: { providers: ProviderConfig[]; analyzer: AnalyzerConfig }`
- 变更说明：
  - 将分析 Provider、分析模型和系统提示词模板配置化，模板必须包含 `{prompt}`、`{outputA}`、`{outputB}` 占位符。
  - 要求 system prompt 明确“以原文摘录为主，只返回 JSON，不输出评论性结论”。
- 备选方案：
  - 方案 A（拒绝）：在 `ComparisonAnalyzer` 内硬编码 provider/model/prompt。问题是环境切换和 A/B 实验成本高，且难以测试。

### Decision 2: 运行时支持“fresh provider instance”以保证并发隔离
- 文件：
  - `packages/core/src/runtime/types.ts`（修改）
  - `packages/core/src/runtime/createProviderRuntime.ts`（修改）
- 函数/类型签名变更：
  - `getProvider(providerId: string, options?: { fresh?: boolean }): IModelProvider`
- 变更说明：
  - 现有 runtime 会按 providerId 缓存单例；同 provider 并发时会共享 `abortController`，导致互相中断风险。
  - 新增 `fresh` 选项，在对比工作流中为 A/B 轨道和分析轨道创建独立实例；普通单聊继续走缓存路径。
- 备选方案：
  - 方案 A（拒绝）：限制 A/B 必须是不同 provider。会损失“同 provider 不同模型”对比场景。
  - 方案 B（拒绝）：给 `IModelProvider` 增加 `clone()`。会扩大接口变更面并影响所有 provider 实现。

### Decision 3: 在核心层新增 `ComparisonAnalyzer`，统一分析提示词拼装和 JSON 解析
- 文件：
  - `packages/core/src/analysis/types.ts`（新增）
  - `packages/core/src/analysis/ComparisonAnalyzer.ts`（新增）
  - `packages/core/src/index.ts`（修改，导出分析模块）
- 函数/类型签名变更：
  - `export interface AnalysisResult { agreements: string; conflictsA: string; conflictsB: string; uniqueA: string; uniqueB: string }`
  - `analyze(prompt: string, outputA: string, outputB: string, onUpdate: (chunk: string) => void): Promise<AnalysisResult>`
- 变更说明：
  - `ComparisonAnalyzer` 负责模板替换、选择分析 provider/model、流式透传、结束后解析 JSON 并返回结构化对象；输出语义约束为“内容摘录优先，避免评价”。
  - 解析策略：优先直接 `JSON.parse`；失败时执行“提取 Markdown 代码块 JSON / 首个完整 JSON 对象”回退；同时兼容字段为字符串数组的返回；仍失败则抛结构化错误，供 UI 降级展示。
- 备选方案：
  - 方案 A（拒绝）：在 UI 中直接请求分析 provider。会让界面层承担网络与协议细节，不利复用与测试。

### Decision 4: 新增 `CompareWorkflowController` 统一编排并发与分析触发
- 文件：
  - `packages/core/src/workflows/CompareWorkflowController.ts`（新增）
  - `packages/core/src/index.ts`（修改，导出控制器）
- 函数/类型签名变更：
  - `export interface CompareModelSelection { providerId: string; modelId: string }`
  - `executeCompareWorkflow(params: { prompt: string; modelA: CompareModelSelection; modelB: CompareModelSelection; onOutputA: (chunk: string) => void; onOutputB: (chunk: string) => void; onAnalysisUpdate: (chunk: string) => void }): Promise<{ outputA: string; outputB: string; analysis: AnalysisResult }>`
- 变更说明：
  - 控制器内部使用 `Promise.all` 并发请求 A/B，二者完成后立即调用 `ComparisonAnalyzer.analyze`。
  - `onAnalysisUpdate` 首次被调用时，UI 触发 `hasAnalysisStartedStreaming = true` 并切换到分析 Tab。
- 备选方案：
  - 方案 A（拒绝）：A/B 串行执行后再分析。实现简单但总耗时明显增加，违背“沉浸式并发”目标。

### Decision 5: UI 采用“路由级视图拆分 + 对比专用 store”落地
- 文件：
  - `apps/web/src/main.ts`（修改，接入路由）
  - `apps/web/src/App.vue`（修改，挂载路由视图与入口）
  - `apps/web/src/router.ts`（新增）
  - `packages/ui/src/views/NormalChatView.vue`（新增或由现有 `ChatApp.vue` 迁移）
  - `packages/ui/src/views/CompareChatView.vue`（新增）
  - `packages/ui/src/components/AnalysisGrid.vue`（新增）
  - `packages/ui/src/components/MarkdownContent.vue`（新增）
  - `packages/ui/src/components/CompareModelSelectors.vue`（新增）
  - `packages/ui/src/store/compare.ts`（新增）
  - `packages/ui/index.ts`（修改，导出新视图/store）
- 函数/类型签名变更：
  - `compare` store:
    - `setModelA(providerId: string, modelId: string): void`
    - `setModelB(providerId: string, modelId: string): void`
    - `executeCompare(prompt: string): Promise<void>`
    - `resetCompareState(): void`
- 变更说明：
  - 普通聊天流程维持现状；对比流程由独立 store 管理 `outputA/outputB/analysisRaw/analysisResult/activeTab/hasAnalysisStartedStreaming`。
  - 普通聊天与对比模式原生输出统一通过 Markdown 渲染组件展示，兼容标题、列表、代码块、链接等常见语法。
  - `CompareChatView` 顶部固定展示当前 prompt + Tabs，中部 panel 可滚动，底部固定双选择器 + 输入区。
  - `AnalysisGrid` 固定映射：第 1 行 `agreements` 跨两列；第 2 行 `conflictsA/conflictsB`；第 3 行 `uniqueA/uniqueB`；各区域展示 A/B 原文摘录而非评论。
- 备选方案：
  - 方案 A（拒绝）：不引入路由，仅在单页切 tab。可实现但不满足“路由拆分”与可分享链接诉求。
  - 方案 B（拒绝）：在现有 `chat` store 混入全部对比状态。会显著提高耦合和维护成本。

## Risks / Trade-offs

- [Risk] 同 provider 并发请求互相 abort 或状态串扰 → Mitigation: 对比流程强制使用 `getProvider(..., { fresh: true })`。
- [Risk] 分析流返回 Markdown 包裹 JSON、半截 JSON 或数组字段导致解析失败 → Mitigation: 增加容错解析与失败降级（保留原始文本 + 错误提示）。
- [Risk] 模型输出偏向评论而非原文摘录，削弱可追溯性 → Mitigation: 强化提示词约束“原文摘录优先”，并在回归测试中覆盖该语义。
- [Risk] 首字自动切页在弱网下触发过慢，用户误以为未开始分析 → Mitigation: A/B 完成后先显示“分析准备中”骨架，再由首字触发切页。
- [Risk] 新增路由与状态导致回归单聊功能 → Mitigation: 保留原 `NormalChatView` 路径与现有 store 行为，增加基础 smoke 测试。

## Migration Plan

1. 在 `packages/core` 完成 `APP_CONFIG.analyzer`、runtime fresh 实例能力、`ComparisonAnalyzer` 与 `CompareWorkflowController`。
2. 在 `packages/ui` 新增 compare store + compare 视图 + 分析网格组件，并接入 core 控制器。
3. 在 `apps/web` 接入路由并提供普通/对比两入口，默认保留现有普通聊天路径。
4. 完成端到端手工验证：双轨并发、首字切页、3x2 网格渲染、分析失败降级。
5. 回滚策略：若线上异常，临时隐藏 `/compare` 路由入口并保持普通聊天路径可用；核心代码改动不影响单聊主链路。

## Open Questions

- 是否允许 A/B 选择完全相同的 provider+model（用于稳定性对照），还是必须不同模型？
- 分析引擎失败时，是否需要自动重试一次并记录失败原因到日志系统？
- 对比结果是否需要持久化到 `IndexedDBStorageProvider`，以及保存粒度（仅最终结构化结果还是包含原始流）？
