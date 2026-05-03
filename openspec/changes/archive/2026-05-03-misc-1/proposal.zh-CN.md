## 为什么

当前工作区在文档阅读、会话管理、保存反馈、消息可读性和 Agent 文件夹入口页上存在几个高频但分散的体验缺口。把这些小功能合并处理，可以在不改变整体 host 架构的前提下提升日常导航和审阅效率。

## 改动内容

- 为当前打开的 markdown 文档增加文内关键字搜索，支持 `Ctrl+F` / `Cmd+F` 打开，提供命中高亮和上/下一个跳转；同时保留 viewer 层搜索接口，供未来非 Markdown viewer 实现。
- 允许用户在会话侧边栏中重命名本地聊天记录。
- 允许用户直接在聊天对话流中编辑一条历史 human/user 消息，将其内容回填到底部输入区，并从该消息位置重新发送；重新发送后，系统会删除该消息之后的所有对话轮次。
- 让文档保存按钮通过颜色反映当前文档的 dirty / saving 状态。
- 为 function call、tool call、search trace 等功能性消息内容增加共享的可折叠展示能力；当存在结构化数据时，普通聊天、Agent mode、预览/导入会话都使用同一展示方式。
- 支持在对话输入中通过 `@文件名` 显式引入工作区文件作为额外上下文；保留现有“首轮自动附带当前选中文档”的行为，并把被引用文件内容以带文件名标记的独立段落拼接进请求文本。
- 选择 Agent owner 文件夹时，如果存在 `index.md`，默认显示该文档，同时保持当前 Agent 上下文。
- 为新增控件和状态补充本地化文案。

## 能力范围

### 新增能力

无。

### 修改能力

- `conversation-workspace`：支持本地会话重命名，并在普通聊天表面渲染共享的可折叠功能性消息详情。
- `conversation-workspace`：支持在对话流中对 human 消息执行“编辑并重新发送”，并在重发时截断其后的对话内容。
- `knowledge-workspace`：通过可复用 viewer 搜索接口支持当前 markdown 文档内搜索、保存按钮 dirty 状态展示、Agent 文件夹 `index.md` 默认页展示，并为对话中的 `@文件名` 引用提供工作区文件解析来源。
- `core-interfaces`：扩展会话与 provider 消息契约，加入共享功能性消息块。
- `agent-runtime-adapter`：为 Agent 工具循环的调用与结果输出结构化功能性消息块。
- `chatgpt-web-provider`：在可识别时把 search / tool / function 元数据归一化为功能性消息块。
- `gemini-api-provider`：在可识别时把 function / tool 元数据归一化为功能性消息块。
- `localized-ui-copy`：增加 markdown 搜索、会话重命名、保存 dirty 状态、功能详情控件相关文案。

## 影响

- 影响共享 UI 组件和 store：`DocumentEditorPane`、`MarkdownDocumentViewer`、`ConversationSidebar`、`NormalChatView`、`DocumentWorkspaceView`、`chat` store、`documentWorkspace` store。
- 额外影响对话编辑相关范围：`NormalChatView`、本地化 UI 文案，以及共享 `chat` store 中与问题/消息生命周期相关的状态和发送链路。
- 影响共享契约：`ConversationMessage`、provider stream/result 类型、clone 和 normalize helper。
- 影响 provider/runtime 路径：Agent runtime 工具循环、ChatGPT Web provider 元数据归一化、Gemini API provider function/tool 元数据归一化、聊天请求文本增强、proxy 类型透传。
- 预计不需要新增外部依赖。
