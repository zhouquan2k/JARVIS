[English](spec.md) | 中文

## 新增需求

### 需求：摘要生成器必须在预设级别进行配置
每个群组预设应能声明一个摘要模型（`GroupSummarizerConfig`），包含 `providerId`、`modelId` 和可选的 `systemPrompt`。运行时通过预设 ID 解析摘要器；若某预设未配置摘要器，则不进行摘要生成。

#### 场景：预设已配置摘要器
- **当** 某群组预设 ID 在 `APP_CONFIG.groupSummarizers` 中有对应的 `GroupSummarizerConfig` 条目时
- **则** 系统必须在成员完成后使用该 provider 和模型运行摘要生成

#### 场景：预设未配置摘要器
- **当** 当前预设 ID 没有对应的 `GroupSummarizerConfig` 条目时
- **则** 系统必须静默跳过摘要生成
- **且** 该轮次不得显示 `Summary` 标签

### 需求：摘要生成器必须在所有成员完成后自动触发
所有成员 provider 完成响应后（≥2 个成员），群组 provider 应自动使用包含所有成员回答的提示词调用已配置的摘要器。结果应流式写入 `groupSummary`。

#### 场景：所有成员完成后自动触发
- **当** 所有成员 provider 已完成（`status` 为 `'done'` 或 `'error'`）时
- **且** 参与成员数量 ≥ 2 时
- **且** 当前预设配置了摘要器时
- **则** 系统必须自动调用摘要器 provider

#### 场景：摘要器流式写入 groupSummary
- **当** 摘要器 provider 开始响应时
- **则** 系统必须将 `groupSummary.phase` 设置为 `'streaming'`
- **且** 每个数据块必须增量更新 `groupSummary.content`
- **然后** 完成时系统必须将 `groupSummary.phase` 设置为 `'done'`

### 需求：摘要生成器不得为单成员轮次触发
当群组轮次只有一个成员参与时，不得调用摘要器，消息中也不得包含 `groupSummary` 字段。

#### 场景：单成员跳过摘要生成
- **当** 群组轮次只有 1 个参与成员时
- **则** 系统不得调用摘要器
- **且** 最终的 `ConversationMessage` 不得包含 `groupSummary` 字段

### 需求：摘要生成器的提示词必须包含成员归因指令
发送给摘要器的提示词应指示其生成三个部分（共识、互补见解、分歧），并使用 `@成员名称` 表示法标注观点归属。

#### 场景：提示词包含归因指令
- **当** 系统构造摘要器提示词时
- **则** 提示词必须包含所有参与成员的名称
- **且** 提示词必须指示模型使用 `@成员名称` 来标注特定成员的观点
- **且** 提示词必须要求输出按共识 / 互补 / 分歧部分组织

### 需求：摘要生成器失败必须被优雅处理
若摘要器 provider 返回错误，系统应将错误记录在 `groupSummary` 中，而不阻塞轮次结果。成员内容应在各自的标签中保持可访问。

#### 场景：摘要器错误记录在 groupSummary 中
- **当** 摘要器 provider 抛出异常或拒绝时
- **则** 系统必须将 `groupSummary.phase` 设置为 `'error'`
- **且** `groupSummary.error` 必须包含错误信息
- **且** 各成员标签必须保持可访问且不受影响

### 需求：摘要生成器必须包含在中止传播中
调用群组 provider 的 `abort()` 时，若摘要器 provider 正在运行，必须将中止转发给它。

#### 场景：中止取消摘要器
- **当** 用户在摘要生成期间中止群组轮次时
- **则** 系统必须对摘要器 provider 调用 `abort()`
- **且** `groupSummary.phase` 必须设置为 `'error'`，并带有中止提示信息

### 需求：摘要生成器必须仅使用 API 型 provider
摘要器应仅解析为 API 型 provider（非 DOM 自动化 provider），以避免与外部站点自动化的时序和生命周期问题。

#### 场景：DOM provider 被排除在摘要器外
- **当** `GroupSummarizerConfig.providerId` 解析到 DOM 自动化 provider 时
- **则** 系统必须记录警告并跳过摘要生成
- **且** 不得向用户呈现任何错误
