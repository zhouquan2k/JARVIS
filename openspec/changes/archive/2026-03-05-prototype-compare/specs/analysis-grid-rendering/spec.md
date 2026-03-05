## ADDED Requirements

### Requirement: Render analysis result with symmetric 3x2 grid mapping
深度剖析面板 MUST 按“总-分-分”语义渲染 3 行 2 列对称网格：第一行跨两列展示 `agreements`，第二行展示 `conflictsA`/`conflictsB`，第三行展示 `uniqueA`/`uniqueB`。各格内容 MUST 以原答案原文摘录为主，而非评价性评论。

#### Scenario: Final analysis result maps to fixed grid positions
- **WHEN** 分析结果包含五个结构化字段
- **THEN** 系统 MUST 将 `agreements` 渲染为第一行跨列区块
- **AND** 系统 MUST 将 `conflictsA`、`conflictsB`、`uniqueA`、`uniqueB` 渲染到预定义左右对称位置，且文本展示应保留原答案表达。

### Requirement: Support progressive rendering during analysis streaming
在分析流进行中，UI MUST 提供渐进式展示能力（如流缓冲解析或骨架屏），避免在最终 JSON 完成前出现空白面板。

#### Scenario: Analysis tab receives streaming content before final parse
- **WHEN** 分析 Tab 已收到首个流数据但尚未形成完整 JSON
- **THEN** 系统 MUST 展示可感知的进行中状态
- **AND** 在解析完成后 MUST 平滑替换为结构化网格内容。

### Requirement: Provide failure-safe analysis panel fallback
当分析结果解析失败时，深度剖析面板 MUST 呈现明确错误状态，并避免破坏原生输出面板可用性。

#### Scenario: Analysis parsing fails
- **WHEN** 分析引擎返回解析错误
- **THEN** 系统 MUST 在深度剖析面板展示错误提示与重试入口或降级说明
- **AND** 用户 MUST 仍可切回“原生输出”Tab 查看 A/B 原文。
