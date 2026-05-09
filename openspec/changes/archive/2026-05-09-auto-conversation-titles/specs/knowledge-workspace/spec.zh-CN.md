## ADDED Requirements

### Requirement: Knowledge workspace MUST automatically title new Agent-pane conversations from the first question
知识工作区 MUST 对右侧 Agent pane 中新建的本地会话应用与普通对话相同的“首条问题自动命名”行为。生成后的标题 MUST 持久化在该本地会话上，并在首轮发送成功后显示在 Agent 会话列表和会话详情头部。

#### Scenario: Title a newly created Agent conversation after the first send
- **WHEN** 用户在知识工作区右侧 Agent pane 中创建一条新的本地会话
- **AND** 该会话当前仍使用占位标题 `New Chat`
- **AND** 首条用户问题发送成功
- **THEN** 系统 MUST 基于该首条问题生成简洁标题
- **AND** 系统 MUST 在 Agent pane 相关会话列表和详情视图中持久化并显示该标题

#### Scenario: Fall back locally when provider-side title generation is unavailable
- **WHEN** Agent pane 会话的首轮发送已经成功
- **AND** 当前 provider 不支持标题生成或标题生成失败
- **THEN** 系统 MUST 保持主助手回复成功
- **AND** 系统 MUST 为该会话应用一个确定性的本地回退标题

### Requirement: Knowledge workspace MUST normalize Markdown filenames in AgentMode file trees
知识工作区 AgentMode 文件树 MUST 将 Markdown 文件名视为展示层规则：当用户创建新文件且未提供扩展名时，系统 MUST 自动补 `.md`；文件树标签 MUST 默认隐藏 `.md` 后缀；非 Markdown 文件 MUST 在树中显示文件类型图标。该行为 MUST 不改变底层文件系统路径或文档身份。

#### Scenario: Auto-append `.md` when creating a new Markdown file
- **WHEN** 用户在 AgentMode 文件树中新建文件
- **AND** 输入的名称不包含文件扩展名
- **THEN** 系统 MUST 创建带 `.md` 后缀的文件
- **AND** 创建出的节点 MUST 解析为工作区中的 Markdown 文档路径

#### Scenario: Hide `.md` in the default display name
- **WHEN** AgentMode 文件树渲染一个 Markdown 文件节点
- **THEN** 展示标签 MUST 默认隐藏 `.md` 后缀
- **AND** 底层节点路径 MUST 保持不变

#### Scenario: Show file-type icons for non-Markdown files
- **WHEN** AgentMode 文件树渲染一个非 Markdown 文件节点
- **THEN** 文件树 MUST 为该节点显示文件类型图标
- **AND** 节点标签 MUST 保留原始文件名

### Requirement: Knowledge workspace MUST provide a Markdown link insertion UI for existing Agent-scope documents
知识工作区 Markdown 编辑器 MUST 提供一个基于 UI 的文档链接插入能力，用户无需手写 Markdown 链接语法即可插入指向已有 Markdown 文档的链接。该选择器 MUST 复用当前 Agent 作用域下的 Markdown 文档集合，插入后的链接 MUST 使用指向目标文档的相对 Markdown 路径。

#### Scenario: Insert a link from the editor toolbar chooser
- **WHEN** 用户正在知识工作区中编辑一份 Markdown 文档
- **AND** 当前 Agent 作用域下至少还有一份其他 Markdown 文档
- **THEN** 编辑器 MUST 提供一个链接插入 UI 入口
- **AND** 当用户选择目标文档后，系统 MUST 在当前光标位置插入指向该文档的 Markdown 链接语法

#### Scenario: Wrap the current selection when inserting a chosen link
- **WHEN** 用户在 Markdown 编辑器中选中了一段文本
- **AND** 用户通过链接插入 UI 选择了一份已有 Markdown 文档
- **THEN** 编辑器 MUST 保留当前选中文本作为链接文本
- **AND** 插入的 href MUST 使用从当前活动文档到目标文档的相对路径

#### Scenario: Exclude the active document from link choices
- **WHEN** 链接插入 UI 枚举可选 Markdown 文档时
- **THEN** 当前正在编辑的活动文档 MUST NOT 出现在可选目标列表中

### Requirement: Knowledge workspace MUST support viewer-mode resizing for local Markdown images
知识工作区 Markdown 中栏 viewer MUST 允许用户在渲染态直接调整本地文档图片的显示比例，而不依赖一条新的编辑器原生图片尺寸契约。缩放交互 MUST 把用户选择的 Crepe 兼容 ratio 持久化回作者 Markdown 源文档，并且 MUST 对不支持的图片来源保持不改写。

#### Scenario: Resize a local Markdown image from the viewer surface
- **WHEN** 用户在知识工作区的 viewer 模式下打开一份 Markdown 文档
- **AND** 渲染内容中包含来自标准 Markdown 图片语法或 wiki-style 图片 embed 语法的本地文档图片
- **THEN** viewer MUST 为该图片提供一个缩放交互入口
- **AND** 拖拽该入口 MUST 在预览中实时更新图片宽度
- **AND** 结束拖拽后 MUST 把所选 ratio 持久化回文档源码

#### Scenario: Persist ratio through HTML image syntax
- **WHEN** 用户完成一张本地 Markdown 图片的缩放交互
- **THEN** 系统 MUST 使用能够保留该缩放比例的作者表达形式来持久化图片 ratio
- **AND** 如果源图片本来已经是 HTML `<img>` 标签或 wiki embed，系统 MUST 归一化成同样的 ratio 形式，而不是重复插入图片条目

#### Scenario: Do not persist ambiguous or unsupported image sources
- **WHEN** 渲染后的图片来源无法唯一映射回当前 Markdown 文档中的源片段
- **OR** 该图片使用远程 URL 或 `data:` URL
- **THEN** viewer MUST NOT 自动改写 Markdown 源文档
- **AND** 其余 Markdown 浏览体验 MUST 保持正常，且不能破坏文档内容

### Requirement: Knowledge workspace MUST materialize pasted Markdown images as `references/` files
当用户在知识工作区的 Markdown 文档中粘贴图片时，系统 MUST 将该图片保存为当前文档附近 `references/` 目录下的真实文件，并且 MUST 在文档中插入指向该文件的 Markdown 引用，而不是把图片字节直接内嵌进源码。

#### Scenario: Paste an image into a Markdown document
- **WHEN** 用户把剪贴板中的图片粘贴进一个可编辑的 Markdown 文档
- **THEN** 系统 MUST 在活动文档相对位置创建或复用 `references/` 目录
- **AND** 系统 MUST 把粘贴的图片写入该目录下的文件
- **AND** 系统 MUST 插入指向该文件的 Markdown 图片语法，而不是把 `data:` URL 直接写进文档

#### Scenario: Keep pasted-image references document-relative
- **WHEN** 系统为新粘贴的图片插入 Markdown 引用
- **THEN** 插入的路径 MUST 保持为相对当前活动 Markdown 文档的路径
- **AND** 该引用文件 MUST 能继续通过知识工作区 viewer 现有的 Markdown 资源路径解析规则被加载

#### Scenario: Do not corrupt the document when pasted-image persistence fails
- **WHEN** 系统无法把图片文件写入活动文档对应的 `references/` 目录
- **THEN** 系统 MUST NOT 自动用巨大的内嵌图片 payload 替换当前文档内容
- **AND** 现有 Markdown 编辑内容 MUST 保持不被破坏
