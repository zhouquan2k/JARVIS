第四阶段：多模型并发对比与智能分析引擎
🎯 阶段目标描述
本阶段旨在将系统从“单线对话工具”全面升级为“多模态对比评测平台”。
系统将通过路由拆分引入独立的“对比聊天视图”，支持用户选用两个不同的大模型并同时发起提问（双轨并发流式渲染）。当双模型均输出完毕后，系统将通过独立的分析引擎（默认由 Gemini API 驱动）自动对两份回答进行深度比较。

在接收到分析流第一个字符的瞬间，系统会自动将用户视线平滑引导至专属的“分析选项卡”，最终以严谨的“总-分-分”对称式 3 行 2 列网格，呈现高度结构化的对比结论（包含共识、A/B各自的分歧点及独有观点），打造极致顺滑的 AI Agent 工作流体验。

一、 全局配置层设计 (Configuration Layer)
在核心包的静态配置字典（config.ts）中，新增针对分析引擎的专属配置节点，彻底剥离硬编码。

APP_CONFIG.analyzer 配置项：

defaultProvider: 指定执行分析任务的 Provider 标识（默认配置为 'gemini-api'）。

defaultModel: 指定分析使用的具体模型（默认配置为 'gemini-2.5-flash'）。

systemPrompt: 深度对比的 System Prompt 模板。

变量插槽：包含 {prompt}、{outputA}、{outputB} 三个动态占位符。

约束指令：明确要求大模型不输出任何 Markdown 标记，严格按照规定的 JSON 格式返回 5 个字段：agreements（双方共识）、conflictsA（A的分歧观点）、conflictsB（B的分歧观点）、uniqueA（A独有观点）、uniqueB（B独有观点）。

二、 视图层路由与结构设计 (UI Architecture)
为了解耦单栏与双栏状态，系统采用双独立视图设计。

1. 顶层视图拆分
普通聊天视图 (NormalChatView)：维持经典的单线请求响应模式与单栏布局。

对比聊天视图 (CompareChatView)：本阶段的核心新增页面，采用基于选项卡（Tab）的平铺结构以最大化利用屏幕空间。

2. CompareChatView 内部结构
2.1. 顶部常驻展示区 (Sticky Context Header)：

当前问题展示区：不再包含输入框，而是以引用（Blockquote）或卡片的形式，静默展示触发当前对比生成的“基准 Prompt”。它充当这块画布的“标题”，时刻提醒用户当前对比的上下文。

选项卡导航 (Tab Navigation)：紧贴在问题下方，包含 Tab A: 「原生输出」 和 Tab B: 「深度剖析」，控制下方主体面板的切换。

2.2. 中间主体内容区 (Scrollable Tab Panels)：

Panel A (原生输出)：纯粹的 CSS Grid 双栏等宽布局，左栏流式渲染 Model A 的回答，右栏流式渲染 Model B 的回答。

Panel B (深度剖析)：专用于渲染分析结果的对称式 3 行 2 列网格（包含共识、A/B各自的分歧点及独有观点）。

注：这一层是可以独立滚动的，无论内容多长，都不会把顶部的问题和底部的输入框顶出屏幕。

2.3. 底部常驻控制台 (Sticky Footer Control Deck)：

模型选择器组：在输入框的上方或左侧，并排摆放两个 <ModelSelector />（分别绑定 Model A 和 Model B 的状态）。

提问输入区：全局统一的文本输入框和发送按钮。用户在这里输入新的问题并点击发送后，顶部的“当前问题展示区”会自动更新，中间的内容区清空并开始新一轮的双流并发。

三、 核心逻辑层设计 (Core Controller & Engine)
这一层负责串联并发调度以及最终结构化数据的总结分析，向下屏蔽具体的 UI 实现。

1. 独立分析引擎类 (ComparisonAnalyzer)
纯业务逻辑类，只依赖全局配置。为了支持“首字触发”的体验，该引擎必须支持流式透传。

数据结构定义 (AnalysisResult)：包含五个字符串属性 agreements, conflictsA, conflictsB, uniqueA, uniqueB。

核心方法签名：
analyze(prompt: string, outputA: string, outputB: string, onUpdate: (chunk: string) => void): Promise<AnalysisResult>

执行流程：
读取配置替换 Prompt 占位符 -> 动态实例化指定的 Provider -> 发起流式请求 -> 将大模型返回的每个 Chunk 透传给 onUpdate -> 请求结束后解析完整的 JSON 字符串并映射为 AnalysisResult 对象返回。

2. 并发调度控制器 (Concurrency Controller)
负责协调双模型对话及触发分析工作流。

核心方法签名：
executeCompareWorkflow(prompt: string, modelA: string, modelB: string): Promise<void>

执行流程：
同时触发 Provider A 和 Provider B 的流式请求 -> 使用 Promise.all 等待双流全部完结 -> 提取完整的 outputA 和 outputB -> 立即静默调用 ComparisonAnalyzer.analyze。

四、 状态管理与自动切页机制 (First-Chunk Trigger)
为提供极其沉浸的体验，系统采用“见流即切”的微交互策略，完美掩盖网络延迟。

状态标识：在对比视图的控制器中，维护一个局部布尔值状态 hasAnalysisStartedStreaming（初始为 false）。

生命周期劫持工作流：

并发调度控制器静默发起分析请求，用户此时停留在「原生输出」Tab，视线焦点在双模型的回答上。

当分析引擎收到 Server-Sent Events 的第一个数据块 (First Chunk)，首次触发 onUpdate 回调。

控制器拦截此回调，检查 hasAnalysisStartedStreaming，立即将其置为 true。

核心跃迁：就在此刻，控制器修改 UI 状态变量，将激活的选项卡强制切换为 Tab B「深度剖析」。

用户的视线被无缝引导至新页面，直接观看分析结果的流式输出过程。

五、 对称式对比网格渲染 (Grid Layout Rendering)
当处于 Tab B 且接收到分析流时，UI 层需处理不完整的 JSON 流（通过缓冲流渐进解析或骨架屏过渡），并在最终严格按照“总-分-分”的逻辑渲染 3 行 2 列网格：

1. 网格布局语义与坐标映射
系统将构建一个完美的左右对峙视觉模型（左侧为 Model A 特性，右侧为 Model B 特性）：

第 1 行 (展现共识 - 横跨两列)：

[1行1列 (合并两列宽度)]：渲染横跨整个容器宽度的内容区块。标题为“1. 达成共识的观点”，填入 agreements 数据。

第 2 行 (展现分歧 - 左右对峙)：

[2行1列]：渲染左侧区块。标题为“2. 冲突点 (Model A 观点)”，填入 conflictsA 数据。

[2行2列]：渲染右侧区块。标题为“2. 冲突点 (Model B 观点)”，填入 conflictsB 数据。

第 3 行 (展现特性 - 左右对峙)：

[3行1列]：渲染左侧区块。标题为“3. Model A 独有的观点”，填入 uniqueA 数据。

[3行2列]：渲染右侧区块。标题为“4. Model B 独有的观点”，填入 uniqueB 数据。