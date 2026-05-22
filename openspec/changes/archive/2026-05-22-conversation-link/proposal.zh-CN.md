## Why

知识工作区中的文档已经可以链接到其他文件，但还无法引用产生某个决策、结论或草稿内容的 Agent 对话。这会让文档难以成为一个稳定的知识入口，用户也无法从文档快速回到当时的讨论上下文。

用户需要一个轻量入口，在当前 Agent 作用域内选择已有对话并把它插入到文档中，后续再从文档点击回到对应对话。本次变更只要求支持“对话级”导航；问题级深链有意不做，以保持链接格式和打开行为足够简单、稳定。

## What Changes

- 在工作区 Markdown 文档编辑时新增一个“插入对话链接”的工具栏入口。
- 让选择器列出当前 Agent 作用域下的本地对话，避免用户手工复制 id 或自己编写自定义 Markdown href。
- 在 Markdown 源码中用应用托管的 href 格式持久化对话链接，链接只标识目标 conversation。
- 扩展 Markdown viewer 的链接处理逻辑，使点击对话链接时能在右侧 Agent pane 打开对应对话。
- 确保右侧对话面板即使当前正处于会话列表态，也能响应外部“打开这个对话”的请求并切换到详情态。
- 明确本次不包含问题级 deep link、问题滚动定位以及跨 Agent 作用域浏览对话等能力。

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `knowledge-workspace`：增加 Markdown 对话链接插入流程，复用当前 Agent 的对话作用域，并把点击后的对话链接重新路由回知识工作区壳层。
- `conversation-workspace`：让右侧 Agent 对话界面支持从工作区链接导航中直接打开指定本地对话，并在必要时切换到详情态。

## Impact

- 影响中栏 Markdown 编辑/预览链路：`packages/ui/src/components/DocumentEditorPane.vue`、`packages/ui/src/document-viewers/MarkdownDocumentViewer.vue`、`packages/ui/src/utils/markdownDocument.ts`。
- 影响知识工作区协调链路：`packages/ui/src/views/DocumentWorkspaceView.vue`、`packages/ui/src/components/AgentView.vue`、`packages/ui/src/components/AgentPane.vue`。
- 影响右侧对话面板链路：`packages/ui/src/components/AgentConversationPanel.vue`、`packages/ui/src/store/chat.ts`。
- 影响测试：中栏单测、工作区视图集成测试，以及插入和打开对话链接的端到端覆盖。
