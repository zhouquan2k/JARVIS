[English](spec.md) | 中文

## 新增需求

### 需求：ProviderStreamUpdate 和 ProviderSendResult 必须携带可选的群组结构化字段
`ProviderStreamUpdate` 和 `ProviderSendResult` 都应携带可选的 `groupMembers` 和 `groupSummary` 字段。这些字段仅由 `MultiModelGroupProvider` 填充；所有其他 provider 不受影响。

#### 场景：群组 provider 在流式更新中发出 groupMembers
- **当** `MultiModelGroupProvider.sendMessage` 在群组轮次中发出 `onUpdate` 时
- **则** 更新对象可以包含 `groupMembers: GroupMemberPart[]` 和可选的 `groupSummary: GroupSummaryPart`
- **且** `text` 字段必须仍然携带扁平化的纯文本回退内容

#### 场景：非群组 provider 不受影响
- **当** `MultiModelGroupProvider` 以外的任何 provider 发出 `onUpdate` 时
- **则** 更新对象中不得出现 `groupMembers` 和 `groupSummary`
- **且** 现有的 `ProviderStreamUpdate` 消费者必须无需修改即可继续正常工作

### 需求：ConversationMessage 必须携带可选的群组结构化字段
`ConversationMessage` 应新增可选的 `groupMembers?: GroupMemberPart[]` 和 `groupSummary?: GroupSummaryPart` 字段。现有的 `content` 字段必须保留，作为供搜索、导出和遗留渲染使用的扁平纯文本回退。

#### 场景：群组轮次消息将结构化字段与 content 一同存储
- **当** 聊天 store 处理群组轮次结果时
- **则** `lastMsg.groupMembers` 和 `lastMsg.groupSummary` 必须从 provider 结果中写入
- **且** `lastMsg.content` 必须仍然包含扁平化的 Markdown 文本

#### 场景：无群组字段的消息通过现有路径渲染
- **当** 一条 `ConversationMessage` 没有 `groupMembers` 字段时
- **则** 渲染系统必须对该消息使用现有的 `MarkdownContent` 路径
- **且** 不得因字段缺失而发生运行时错误
