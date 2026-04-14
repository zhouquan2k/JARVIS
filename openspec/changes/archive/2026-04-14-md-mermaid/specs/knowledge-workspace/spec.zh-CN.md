[English](spec.md) | 中文

## ADDED Requirements

### 需求：知识工作区 Markdown viewer SHALL 提供 viewer 和 edit 模式
知识工作区主 Markdown 文档 viewer SHALL 为 `text/markdown` 文档提供用户可见的 `viewer` / `edit` 模式开关。打开 Markdown 文档时 viewer SHALL 默认进入 `viewer` 模式，且模式切换 MUST 保留当前 Markdown 内容、保存行为和可编辑文档工作流。

#### 场景：默认以 viewer 模式打开 Markdown 文档
- **WHEN** 用户在知识工作区主面板打开 `text/markdown` 文档
- **THEN** 系统 MUST 以 `viewer` 模式渲染该 Markdown viewer
- **AND** 模式开关 MUST 在主 Markdown viewer 头部可见

#### 场景：切换模式不丢失编辑内容
- **WHEN** 用户编辑 Markdown 内容并在 `viewer` 和 `edit` 之间切换
- **THEN** 系统 MUST 保留 editor 中最新的 Markdown 内容
- **AND** 切换后保存动作 MUST 继续保存同一份文档内容

#### 场景：非 Markdown 纯文本文档不要求显示 Markdown 预览控件
- **WHEN** 当前 text viewer 文档的 `mimeType` 不是 `text/markdown`
- **THEN** 系统 MUST NOT 要求为该文档显示 Mermaid 或 Markdown 图片预览控件

### 需求：知识工作区 Markdown viewer SHALL 在 viewer 模式渲染 Mermaid 图
知识工作区主 Markdown viewer SHALL 在 `viewer` 模式下使用官方 `mermaid` 包，将语言标记为 `mermaid` 的 fenced code block 渲染为图。在 `edit` 模式下，同一代码块 MUST 保持为可编辑源码文本。

#### 场景：viewer 模式将 Mermaid 代码块渲染为图
- **WHEN** `text/markdown` 文档包含语言标记为 `mermaid` 的 fenced code block
- **AND** Markdown viewer 模式为 `viewer`
- **THEN** 系统 MUST 为该代码块显示渲染后的 Mermaid 图
- **AND** 普通 Markdown 内容 MUST 仍保持现有编辑工作流可用

#### 场景：edit 模式显示 Mermaid 源码
- **WHEN** `text/markdown` 文档包含语言标记为 `mermaid` 的 fenced code block
- **AND** Markdown viewer 模式为 `edit`
- **THEN** 系统 MUST 将 Mermaid 代码块显示为可编辑源码文本

#### 场景：隔离 Mermaid 渲染失败
- **WHEN** Mermaid 源码无效或渲染过程抛出异常
- **THEN** 系统 MUST 保持文档 viewer 已挂载且可用
- **AND** 系统 MUST 为该代码块显示受控的 preview 错误，或回退到源码/空预览，不得导致工作区 pane 崩溃

### 需求：知识工作区 Markdown viewer SHALL 渲染已有 Markdown 图片链接
知识工作区主 Markdown viewer SHALL 在 `viewer` 模式下将已有 Markdown 图片链接显示为图片。支持的图片来源 MUST 包括远程 URL、`data:image/...` URL，以及按当前 Markdown 文档目录解析的本地相对路径。

#### 场景：渲染远程 Markdown 图片链接
- **WHEN** `text/markdown` 文档包含来源为 `http:` 或 `https:` URL 的 Markdown 图片链接
- **AND** Markdown viewer 模式为 `viewer`
- **THEN** 系统 MUST 在文档正文中显示该链接图片

#### 场景：渲染 data URL Markdown 图片链接
- **WHEN** `text/markdown` 文档包含来源以 `data:image/` 开头的 Markdown 图片链接
- **AND** Markdown viewer 模式为 `viewer`
- **THEN** 系统 MUST 在文档正文中显示嵌入图片

#### 场景：按活动文档目录解析相对 Markdown 图片链接
- **WHEN** 路径为 `/notes/guide.md` 的 `text/markdown` 文档包含类似 `![diagram](./images/flow.png)` 的 Markdown 图片链接
- **AND** Markdown viewer 模式为 `viewer`
- **THEN** 系统 MUST 按 `/notes/` 解析该图片路径
- **AND** 系统 MUST 使用 workspace 文档加载路径或宿主兼容 URL 路径显示图片，不得暴露无关本地文件系统路径

#### 场景：不新增图片资产管理能力
- **WHEN** 用户查看或编辑包含图片链接的 Markdown 文档
- **THEN** 系统 MUST NOT 要求本次变更新增上传、粘贴写入、拖拽导入或独立图片资产管理行为

### 需求：知识工作区 Markdown viewer SHALL 将 wiki 式 PDF 嵌入渲染为内嵌预览
知识工作区主 Markdown viewer SHALL 在 `viewer` 模式下将 wiki 式 PDF 嵌入（`![[file.pdf]]`）及指向 `.pdf` 文件的标准 Markdown 图片语法在文档正文中渲染为内嵌 `<iframe>` PDF 预览，效果与 Obsidian 保持一致。PDF 来源 MUST 通过与其他资产相同的文档相对路径解析进行处理。

#### 场景：viewer 模式将 wiki 式 PDF 嵌入渲染为内嵌 iframe
- **WHEN** `text/markdown` 文档包含 wiki 式嵌入 `![[file.pdf]]`
- **AND** Markdown viewer 模式为 `viewer`
- **THEN** 系统 MUST 在文档正文中嵌入位置渲染一个 `<iframe>`
- **AND** iframe 的 `src` MUST 解析为该 PDF 文件对应的正确 `document-asset` URL

#### 场景：指向 PDF 的标准 Markdown 图片语法渲染为内嵌 iframe
- **WHEN** `text/markdown` 文档包含 `![alt](path/to/file.pdf)`
- **AND** Markdown viewer 模式为 `viewer`
- **THEN** 系统 MUST 在文档正文中渲染 `<iframe>`，而非损坏的图片或纯文本链接

#### 场景：edit 模式不显示 PDF embed
- **WHEN** `text/markdown` 文档包含 wiki 式 PDF 嵌入或指向 `.pdf` 文件的 Markdown 图片链接
- **AND** Markdown viewer 模式为 `edit`
- **THEN** 系统 MUST NOT 注入内嵌 PDF iframe；源码保持可编辑状态

#### 场景：PDF embed 在外部内容同步后仍保持可见
- **WHEN** 内嵌 PDF embed 已注入文档正文
- **AND** 外部内容同步触发 ProseMirror 重新协调 DOM
- **THEN** 系统 MUST 重新注入 PDF embed，确保用户可见

### 需求：知识工作区 Markdown viewer SHALL 保持现有 viewer 边界
Mermaid 和图片预览行为 SHALL 只应用于知识工作区主 Markdown 文档 viewer。聊天消息 Markdown 渲染、PDF viewing、unsupported viewer handling、diff 展示、undo/redo 和 document registry 解析 MUST 保持现有职责。

#### 场景：不改变聊天消息 Markdown 渲染
- **WHEN** 聊天消息通过聊天 Markdown renderer 渲染
- **THEN** 本变更 MUST NOT 要求聊天消息 renderer 使用主文档 viewer 的 Mermaid 或图片预览实现

#### 场景：保持 PDF 和 unsupported 文档行为
- **WHEN** 活动文档是 PDF 或不支持的 MIME type
- **THEN** 系统 MUST 继续使用现有 PDF viewer 或 unsupported viewer 状态
- **AND** Markdown viewer 模式开关 MUST NOT 替换这些 viewer 路径

#### 场景：保持文件变更 diff 和 undo redo 控件
- **WHEN** Markdown 文档存在 latest file change record
- **AND** 用户在 `viewer` 和 `edit` 之间切换
- **THEN** 系统 MUST 继续由现有 document pane 行为管理文件变更 diff 和 undo/redo 控件
