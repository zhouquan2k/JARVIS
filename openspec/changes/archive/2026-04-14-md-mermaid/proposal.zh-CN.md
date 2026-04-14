[English](proposal.md) | 中文

## 原因

当前主 Markdown viewer 对 Mermaid 代码块和 Markdown 图片链接主要以可编辑源码形式展示，导致包含图表的知识工作区文档难以直接阅读和校验。本变更在保留现有 Milkdown 可编辑链路的前提下，为知识工作区 Markdown 文档 viewer 增加默认预览优先的模式，并明确不触碰聊天消息 Markdown 渲染器。

## 变更内容

- 在主 Markdown viewer 右上角增加 `viewer` / `edit` 模式开关，新进入文档默认使用 `viewer`。
- `viewer` 模式下，通过官方 `mermaid` 包渲染 fenced `mermaid` 代码块，同时保持普通 Markdown 可编辑。
- `edit` 模式下，Mermaid 代码块保持源码编辑形态，用户可以直接修改图定义。
- `viewer` 模式下，将已有 Markdown 图片链接显示为图片，覆盖远程 URL、`data:image/...` URL，以及按当前文档位置解析的本地相对路径。
- `viewer` 模式下，wiki 式 PDF 嵌入（`![[file.pdf]]`）在文档正文中渲染为内嵌 `<iframe>` 预览，效果与 Obsidian 保持一致。指向 `.pdf` 文件的标准 Markdown 图片语法同样按此处理。
- 保持当前保存、自动保存、diff、undo/redo 和 document viewer registry 行为不变。
- 不修改 `MarkdownContent.vue` 或聊天消息 Markdown 渲染链路。
- 不新增图片上传、粘贴写入、拖拽导入图片或独立图片资源管理能力。

## 能力

### 新能力
- `<none>`：本变更扩展已有知识工作区文档 viewer 行为，不新增独立产品能力。

### 修改能力
- `knowledge-workspace`：增加主 Markdown viewer 的 viewer/edit 模式切换、Mermaid 预览渲染、Markdown 图片显示和基于文档作用域的相对图片路径解析要求。

## 影响

- 影响 `packages/ui/src/components/DocumentEditorPane.vue`，用于 viewer/edit 模式 UI、editor 生命周期切换，以及内嵌 PDF 预览的样式。
- 影响 `packages/ui/src/utils/markdownDocument.ts`，用于 Milkdown Crepe 创建、CodeMirror preview 配置、图片渲染支持，以及基于 DOM 注入的 PDF embed 逻辑。
- 预计在 `packages/ui/src/utils/` 下新增聚焦的 Mermaid preview 工具，隔离 Mermaid 初始化和渲染失败处理。
- 可能影响 UI 层文档路径传递，以便本地相对图片链接按当前 Markdown 文档目录解析。
- 如果仓库尚未引入官方 `mermaid` 包，则需要新增该运行时依赖。
- 需要补充针对工作区文档 viewer 的定向回归测试；若覆盖 extension E2E，必须申请提权并使用支持 MV3 的 Chromium channel。
