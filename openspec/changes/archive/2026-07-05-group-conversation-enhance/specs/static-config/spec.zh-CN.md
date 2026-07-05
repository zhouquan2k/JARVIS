[English](spec.md) | 中文

## 新增需求

### 需求：APP_CONFIG 必须在预设级别支持 groupSummarizers
`APP_CONFIG` 应包含一个以群组预设 ID 为键的 `groupSummarizers` 记录。每个条目应声明摘要器的 `providerId`、`modelId` 和可选的 `systemPrompt`。运行时应在处理群组轮次时使用此配置解析摘要器。

#### 场景：groupSummarizers 条目为预设提供摘要器
- **当** `APP_CONFIG.groupSummarizers[presetId]` 已定义时
- **则** `createModelProviderRuntime` 必须将声明的 `providerId` 和 `modelId` 解析为该预设的摘要器

#### 场景：缺少 groupSummarizers 条目禁用摘要生成
- **当** `APP_CONFIG.groupSummarizers[presetId]` 未定义或键不存在时
- **则** 运行时必须将该预设的摘要生成视为禁用
- **且** 使用该预设的轮次不得生成 `groupSummary` 字段

#### 场景：存在 groupSummarizers systemPrompt 时应用
- **当** `GroupSummarizerConfig.systemPrompt` 已提供时
- **则** 系统必须将该值作为摘要模型的系统提示词
- **且** 必须覆盖 `groupSummaryPrompt.ts` 中定义的默认摘要器系统提示词
