## Why

当前系统仍以单模型、单线对话为主，用户在需要评估模型差异时必须手动切换和比对，效率低且上下文容易丢失。第四阶段需要把产品升级为可并发对比、可自动分析的工作流，让用户在一次提问中直接看到“答案内容本身”的结构化摘录，而不是额外评论。

## What Changes

- 新增独立的对比聊天视图，与普通聊天视图分离，支持双模型并发流式输出。
- 在对比视图中引入粘性顶部上下文区、Tab 导航、可滚动内容区和粘性底部控制台，统一承载双轨对话与分析展示。
- 新增 `ComparisonAnalyzer` 分析引擎，基于配置动态选择分析 Provider/Model，支持流式透传与最终 JSON 解析，并要求输出以原答案原文摘录为主。
- 新增并发调度控制器，统一编排 Model A / Model B 并发请求、结果聚合和分析触发时机。
- 增加“首字触发自动切页”机制：分析流出现首个 chunk 时自动切换到“深度剖析”Tab。
- 新增“总-分-分”对称式 3 行 2 列分析结果渲染，输出字段固定为 `agreements`、`conflictsA`、`conflictsB`、`uniqueA`、`uniqueB`，字段内容聚焦原文摘录而非评价话术。
- 新增原生输出 Markdown 渲染能力：当模型返回 Markdown 时，网页按 Markdown 语义展示（标题、列表、代码块、链接）。
- 扩展全局静态配置，新增 `APP_CONFIG.analyzer` 节点，移除分析相关硬编码。

## Capabilities

### New Capabilities
- `compare-chat-view`: 提供对比聊天专属路由和页面结构，支持双栏原生输出（含 Markdown 渲染）与分析面板切换。
- `comparison-analyzer-engine`: 提供基于模板 Prompt 的分析引擎，支持流式回调与最终结构化结果产出（原文摘录优先）。
- `compare-workflow-controller`: 提供双模型并发执行、汇总与分析触发编排能力，并暴露 UI 可消费状态。
- `analysis-grid-rendering`: 提供分析结果的对称式 3x2 网格展示语义与字段映射规则。

### Modified Capabilities
- `static-config`: 新增 `APP_CONFIG.analyzer`（`defaultProvider`、`defaultModel`、`systemPrompt`）并约束占位符与输出格式。
- `provider-model-selector`: 在对比视图中扩展为双模型选择器（A/B 独立绑定），保持与运行时可用模型一致。
- `web-host-app`: 增加普通聊天与对比聊天的视图/路由切换入口，保证共享输入与会话流程的连续体验。

## Impact

- 受影响代码范围：`packages/core`（配置、分析引擎、并发控制）、`packages/ui`（对比视图与交互状态）、`apps/web`（路由与宿主编排）。
- 受影响接口：Provider 发送消息流程复用但并发调用次数提升；分析链路新增独立调用路径。
- 受影响依赖：默认依赖 Gemini API 作为分析 Provider（可通过配置切换）。
- 受影响系统行为：对比模式下将引入额外分析请求与流式渲染状态，需要补充错误处理与降级策略。
