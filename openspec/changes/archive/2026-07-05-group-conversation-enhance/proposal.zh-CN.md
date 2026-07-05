## 背景

群组对话目前将所有成员回复合并为一条长文本的 assistant 消息（通过 `### 成员名称` 标题分隔），导致用户难以快速对比不同模型的观点。同时也缺乏将各成员观点综合为结构化摘要的机制（涵盖共识、互补见解和分歧）。

## 变更内容

- **群组回复渲染**：每个群组轮次现在渲染为标签页卡片——一个 `Summary`（摘要）标签 + 每个成员一个标签，而非单一合并的 Markdown 气泡。
- **自动摘要生成**：所有成员完成响应后（≥2 个成员），由预设级别固定的摘要生成模型自动生成结构化摘要（共识 / 互补 / 分歧），并以可点击的 `@成员` chips 标注来源。
- **单成员降级**：当只有 1 个成员参与时，不显示 Summary 标签，回复降级为普通气泡。
- **流式响应标签 UX**：流式传输期间默认显示第一个成员的标签；摘要生成完成后（且用户未手动切换标签），视图自动切换到 Summary 标签。
- **面板 ↔ 全屏切换对称性**：右侧面板工具栏中已有"展开到全屏"按钮，现为全屏聊天头部新增对称的"折叠到面板"按钮。
- **文档跟随上下文切换**：切换工作区/对话时，自动打开并聚焦第一个关联文档（`documentIds[0]`）；无关联时为空操作。

## 功能点

### 新增功能

- `group-message-tabs`：群组对话轮次的标签页渲染，包含每成员标签、摘要标签、流式状态指示器和 `@成员` chip 导航。
- `group-summarizer`：由预设配置的摘要模型自动对群组轮次进行总结，生成结构化的共识/互补/分歧输出；仅在 ≥2 个成员参与时触发。
- `conversation-context-follow`：切换对话或切换面板↔全屏时自动打开/聚焦文档；使用对话中已存储的 `Conversation.documentIds`。

### 修改功能

- `core-interfaces`：`ProviderStreamUpdate`、`ProviderSendResult` 和 `ConversationMessage` 新增可选的 `groupMembers?: GroupMemberPart[]` 和 `groupSummary?: GroupSummaryPart` 字段（增量，向后兼容）。
- `static-config`：`APP_CONFIG` 新增 `groupSummarizers: Record<presetId, { providerId; modelId; systemPrompt? }>` 字段，与现有 `groupPresets` 并列。

## 影响范围

- **`plugins/ai-agent`**：`group/groupTypes.ts`、`interfaces/IModelProvider.ts`、`interfaces/Conversation.ts`、`store/chat.ts`、`providers/model/MultiModelGroupProvider.ts`、`runtime/createModelProviderRuntime.ts`、新增 `group/groupSummaryPrompt.ts`、新增 `components/GroupMessageTabs.vue`、`views/NormalChatView.vue`、`components/AgentConversationPanel.vue`。
- **`packages/core`**：`config.ts`（新增 `groupSummarizers` 字段）。
- **`packages/ui`**：`views/WorkspaceHostApp.vue`（文档跟随桥接）；`store/documentWorkspace.ts` 复用现有的 `openNode()`。
- **无破坏性变更**：所有新字段均为可选；不含 `groupMembers` 的现有对话继续通过现有的 Markdown 路径渲染。
