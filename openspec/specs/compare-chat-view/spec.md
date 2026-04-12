English | [中文](spec.zh-CN.md)

## MODIFIED Requirements

### Requirement: Provide dedicated compare chat view
系统 MUST 提供独立的对比聊天视图，用于承载双模型并发对话与分析结果展示，并与普通聊天视图分离。该能力 MUST 在 Web 宿主与 extension 全窗口宿主中保持一致行为语义。

#### Scenario: User opens compare mode from extension full-window host
- **WHEN** 用户在 extension 全窗口宿主中进入对比模式入口
- **THEN** 系统 MUST 渲染对比聊天视图而非普通单栏聊天视图
- **AND** 视图 MUST 展示 Model A 与 Model B 的独立选择状态。

### Requirement: Support tabbed native-output and analysis panels
对比聊天视图 MUST 提供“原生输出”和“深度剖析”两个 Tab，并在原生输出 Tab 中以双栏等宽展示 A/B 输出；深度剖析 Tab MUST 展示基于 A/B 原文摘录的结构化内容，而不是泛化评论。该行为 MUST 在 extension 全窗口宿主与 Web 宿主中一致。

#### Scenario: Native output panel shows side-by-side model responses in extension host
- **WHEN** 用户处于 extension 对比视图“原生输出”Tab 且双模型开始流式返回
- **THEN** 左列 MUST 仅展示 Model A 输出
- **AND** 右列 MUST 仅展示 Model B 输出。

### Requirement: Render native model output as Markdown on web
当模型原生输出为 Markdown 文本时，页面 MUST 以 Markdown 语义渲染（如标题、列表、代码块、链接），而不是仅按纯文本展示。该 requirement 适用于 Web 宿主与 extension 全窗口宿主。

#### Scenario: Native output includes markdown syntax in extension host
- **WHEN** extension 对比视图中的 Model A 或 Model B 返回包含 Markdown 语法的输出
- **THEN** 原生输出面板 MUST 以对应 HTML 结构渲染 Markdown 内容
- **AND** 代码块与行内代码 MUST 保持可读样式与换行。
