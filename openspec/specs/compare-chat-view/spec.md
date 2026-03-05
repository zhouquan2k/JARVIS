## ADDED Requirements

### Requirement: Provide dedicated compare chat view
系统 MUST 提供独立的对比聊天视图，用于承载双模型并发对话与分析结果展示，并与普通聊天视图分离。

#### Scenario: User opens compare mode
- **WHEN** 用户进入对比模式入口（路由或宿主切换入口）
- **THEN** 系统 MUST 渲染对比聊天视图而非普通单栏聊天视图
- **AND** 视图 MUST 展示 Model A 与 Model B 的独立选择状态。

### Requirement: Render compare view with sticky context and tabbed panels
对比聊天视图 MUST 使用“顶部上下文 + Tab 导航 + 可滚动内容区 + 底部输入控制台”的布局，并保证顶部与底部在长内容下保持可见。

#### Scenario: Long outputs do not push sticky regions out of viewport
- **WHEN** 原生输出或分析结果内容高度超过可视区
- **THEN** 中间内容区 MUST 独立滚动
- **AND** 顶部当前问题与底部输入控制区 MUST 持续可见。

### Requirement: Support tabbed native-output and analysis panels
对比聊天视图 MUST 提供“原生输出”和“深度剖析”两个 Tab，并在原生输出 Tab 中以双栏等宽展示 A/B 输出；深度剖析 Tab MUST 展示基于 A/B 原文摘录的结构化内容，而不是泛化评论。

#### Scenario: Native output panel shows side-by-side model responses
- **WHEN** 用户处于“原生输出”Tab 且双模型开始流式返回
- **THEN** 左列 MUST 仅展示 Model A 输出
- **AND** 右列 MUST 仅展示 Model B 输出。

### Requirement: Render native model output as Markdown on web
当模型原生输出为 Markdown 文本时，Web 页面 MUST 以 Markdown 语义渲染（如标题、列表、代码块、链接），而不是仅按纯文本展示。

#### Scenario: Native output includes markdown syntax
- **WHEN** Model A 或 Model B 返回包含 Markdown 语法的输出
- **THEN** 原生输出面板 MUST 以对应 HTML 结构渲染 Markdown 内容
- **AND** 代码块与行内代码 MUST 保持可读的样式与换行。

### Requirement: Auto-switch to analysis tab on first analysis chunk
系统 MUST 在分析流收到首个数据块时自动切换到“深度剖析”Tab，以呈现分析结果流式生成过程。

#### Scenario: First analysis chunk triggers tab switch
- **WHEN** 分析引擎第一次触发分析更新回调
- **THEN** 系统 MUST 将活动 Tab 切换为“深度剖析”
- **AND** 该切换 MUST 仅在当前轮对比中首次触发一次。
