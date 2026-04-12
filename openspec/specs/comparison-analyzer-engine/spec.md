English | [中文](spec.zh-CN.md)

## ADDED Requirements

### Requirement: Run analyzer with configuration-driven provider and model
分析引擎 MUST 从 `APP_CONFIG.analyzer` 读取默认 Provider、默认模型与系统提示词模板，并通过 `{prompt}`、`{outputA}`、`{outputB}` 占位符构造最终分析请求。

#### Scenario: Analyzer resolves provider and model from static config
- **WHEN** 系统发起一次对比分析请求
- **THEN** 分析引擎 MUST 使用配置中的 `defaultProvider` 与 `defaultModel` 执行分析
- **AND** 发送给模型的提示词 MUST 包含已替换完成的三个占位符值。

### Requirement: Stream analyzer output to caller
分析引擎 MUST 支持流式透传，在分析响应尚未结束时将每次增量内容通过回调抛出给上层调用者。

#### Scenario: Analyzer emits progressive updates
- **WHEN** 分析 Provider 返回流式数据块
- **THEN** 引擎 MUST 按接收顺序触发 `onUpdate` 回调
- **AND** 上层 MUST 能在最终结果完成前消费这些更新。

### Requirement: Produce structured five-field analysis result
分析引擎 MUST 将最终响应解析为包含 `agreements`、`conflictsA`、`conflictsB`、`uniqueA`、`uniqueB` 五个字段的结构化结果；字段内容 MUST 优先展示来自 A/B 原答案的原文摘录（可为字符串或字符串数组），而非主观评论。

#### Scenario: Analyzer returns valid JSON payload
- **WHEN** 模型最终返回满足字段约束的 JSON 字符串
- **THEN** 引擎 MUST 成功解析并返回完整 `AnalysisResult`
- **AND** 五个字段 MUST 全部存在且可用于 UI 渲染，并保持“内容优先、评论最少”语义。

#### Scenario: Analyzer returns markdown-fenced JSON or array fields
- **WHEN** 模型返回 Markdown 代码块包裹的 JSON，或字段值为字符串数组
- **THEN** 引擎 MUST 能提取并解析出五字段结果
- **AND** 上层 UI MUST 能继续渲染而不是直接进入解析失败态。

#### Scenario: Analyzer returns invalid or incomplete JSON payload
- **WHEN** 模型最终响应无法解析为符合约束的 JSON
- **THEN** 引擎 MUST 抛出可识别的解析错误
- **AND** 错误信息 MUST 允许上层触发降级展示逻辑。
