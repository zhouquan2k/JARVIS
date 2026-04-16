## ADDED Requirements

### Requirement: Knowledge workspace MUST provide a read-only image viewer
知识工作区 MUST 能通过统一的 `DocumentViewer` registry 将常见图片 MIME 类型解析到只读图片 viewer，并在主面板中显示当前图片文件。该 viewer MUST 复用 `IContextProvider.readDocument()` 返回的 `mimeType` 与 `dataBase64` 载荷，不得要求独立的图片读取接口。

#### Scenario: Resolve supported image MIME types with the image viewer
- **WHEN** 当前激活文档的 `mimeType` 为 `image/png`、`image/jpeg`、`image/gif`、`image/svg+xml` 或 `image/webp`
- **THEN** 系统 MUST 将该文档解析到 `image` viewer
- **AND** 该 viewer MUST 标记为可查看但不可编辑

#### Scenario: Render the active image document in the main pane
- **WHEN** 用户在知识工作区打开一个已支持的图片文档
- **THEN** 主面板 MUST 使用当前文档的 `mimeType` 与 `dataBase64` 构造可显示的图片来源
- **AND** 图片 MUST 在主面板可见区域内自适应显示，而不是撑破三栏布局

#### Scenario: Keep image documents out of text editing flows
- **WHEN** 当前激活文档由 `image` viewer 打开
- **THEN** 系统 MUST 禁用保存入口并保持文本草稿内容为空
- **AND** 系统 MUST NOT 挂载 Markdown/text 编辑器、Markdown 模式切换、diff、undo 或 redo 交互

#### Scenario: Preserve unsupported fallback for non-registered image-like files
- **WHEN** 当前激活文档的 `mimeType` 未命中任何已注册 viewer
- **THEN** 系统 MUST 继续显示明确的“不支持此文档类型”状态
- **AND** 系统 MUST NOT 因文件看起来像图片就绕过 MIME registry 强行渲染
