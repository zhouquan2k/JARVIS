## Why

当前新建会话会先显示为 `New Chat`，之后最多只按首条问题做原样截断。这种行为过于字面，遇到长问题时不够简洁，也没有明确 Agent 模式新会话该如何命名。我们需要一个共享约束，让所有新建会话都能基于用户问题得到简短标题，同时避免明显增加等待时间和 token 成本。

在知识工作区里，Markdown 编辑仍然要求用户手写 Markdown 链接语法。对于已经存在于当前 Agent 作用域内的文档，这种方式既慢也容易写错。我们需要一个轻量 UI 入口，让用户通过选择现有文档来插入链接，而不是自己拼 Markdown 语法。

在同一条知识工作区 Markdown viewer 链路里，图片展示目前除了现有的 edit/view 切换外基本仍是只读的。用户无法像 Obsidian 那样在渲染视图里直接调整本地图片的显示宽度，因此当图片显示过大时，仍然需要回到源码里手工改写。我们需要一个 viewer 模式下的图片缩放交互，让用户拖拽本地 Markdown 图片的展示宽度，并把该宽度持久化回文档源码。

当前 Markdown 编写链路还存在另一个问题：如果把图片直接以内嵌 `data:` 或编辑器默认 embed 的方式写入文档，Markdown 很容易变得又长又乱。我们希望图片粘贴时把图片实体化为当前文档附近 `references/` 目录下的真实文件，再在 Markdown 中插入对该文件的引用，这样文档正文保持可读，图片资源也更容易管理。

## What Changes

- 为新建的本地会话增加自动标题生成能力，在首条用户问题发送后生效，同时覆盖普通对话模式和 Agent 模式。
- 当用户编辑并重发第一条可见问题时，重新生成标题；普通后续追问不覆盖后续的手动重命名结果。
- 扩展共享 provider 契约，增加可选的会话标题生成能力。
- 要求各 provider 在生成标题时使用低成本、非思考模型，而不是继承当前会话的活动模型或推理强度。
- 增加确定性的本地回退标题规则，确保标题生成失败时不会阻塞主消息发送。
- 通过现有会话持久化、侧边栏列表和恢复后的详情视图保留生成后的标题。
- 在 AgentMode 文件树中新建 Markdown 文件时自动补 `.md`，默认标签隐藏 `.md`，并为非 Markdown 文件显示文件类型图标。
- 在 Markdown 编辑态增加知识工作区内链插入入口，让用户从当前 Agent 作用域已有 Markdown 文档中选择目标，并自动写入 Markdown 链接语法。
- 在 Markdown viewer 模式下增加本地图片缩放入口，让用户拖拽改变渲染宽度，并把所选宽度写回 Markdown 源文档。
- 在 Markdown 文档中粘贴图片时，把图片保存到 `references/` 目录并插入对该文件的 Markdown 引用，而不是把图片数据直接内嵌进文档。

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `conversation-workspace`：基于用户首条问题自动命名新建本地会话，并在编辑重发第一条可见问题时重生成标题。
- `knowledge-workspace`：对知识工作区右侧 Agent 对话中新建的会话应用同样的自动命名行为，同时更新 AgentMode 文件树展示，让 Markdown 文件默认隐藏 `.md`，非 Markdown 文件显示类型图标，并增加复用当前 Agent 文档集合的 Markdown 链接插入 UI。
- `knowledge-workspace`：在知识工作区中栏 Markdown viewer 中，允许本地 Markdown 图片在 viewer 模式下被可视化缩放，并把作者设置的宽度持久化回文档。
- `knowledge-workspace`：在 Markdown 编写链路中，把粘贴图片实体化为 `references/` 文件，并从文档中引用这些文件，而不是内嵌图片数据。
- `core-interfaces`：为 provider 增加可选的短会话标题生成能力，并与正常消息发送链路解耦。
- `chatgpt-web-provider`：通过共享标题生成能力支持低成本 provider 侧标题生成。
- `gemini-api-provider`：通过共享标题生成能力支持低成本 provider 侧标题生成。

## Impact

- 影响共享 UI / store 主链路：`packages/ui/src/store/chat.ts` 及相关标题工具。
- 影响 AgentMode 展示链路：`DocumentFileTree`、`AgentDocumentTree`、`DocumentEditorPane`、`MarkdownDocumentViewer`，以及文件树渲染所用的工作区展示辅助工具。
- 影响 Markdown 编辑/预览链路：`DocumentEditorPane`、`MarkdownDocumentViewer` 和 `packages/ui/src/utils/markdownDocument.ts`，用于 viewer 模式图片增强与 Markdown 回写辅助逻辑。
- 影响图片持久化链路：Markdown 编辑器的粘贴处理，以及用于在活动文档旁创建 `references/` 图片文件的 context-provider 写入路径。
- 影响共享核心契约：`IModelProvider` 以及桌面端、扩展端转发 provider 能力所需的代理协议。
- 影响 provider 实现：ChatGPT Web、Gemini API，以及桌面端和扩展端的代理实现。
- 不预期引入新的外部依赖；本次变更复用现有 provider 访问链路和本地会话持久化能力。
