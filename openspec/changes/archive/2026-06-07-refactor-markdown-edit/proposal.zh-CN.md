> **语言**: [English](proposal.md) | 中文

## Why

在 Markdown viewer（所见即所得）模式下做格式化或插入链接时，编辑器目前会走一条隐藏的 `viewer → edit(原始源码) → viewer` 往返流程，并把渲染后的 DOM 选区**反向映射**回原始源码的字符偏移。这带来两类反复出现的缺陷：编辑成功后视口跳回顶部（高亮"格式刷"已暴露此问题），以及插入链接落点不准——因为 DOM 到源码的偏移映射本质有损（重复文本、空块、列表、表格、frontmatter 偏移都会出错）。这并非孤立 bug，而是同一个根因的症状：viewer 模式的操作是针对"原始源码模型"编写的，而不是用户真正在交互的那个活动编辑器。

## What Changes

- 为 Markdown viewer 模式引入**就地（in-place）所见即所得编辑命令**，直接作用于活动的 ProseMirror 选区，不切换到原始源码 edit 模式、也不重建编辑器。
  - viewer 模式下的高亮（"格式刷"）对当前选区切换 highlight mark。（原型已验证。）
  - viewer 模式下的链接 / 会话链接插入，对当前选区施加 link mark（无选区时在光标处插入带标签的链接）。
- viewer 模式的格式化 / 链接操作**必须保持滚动位置 / 视口**（不跳回顶部）。
- viewer 模式的链接插入**必须精准落在用户的真实选区**，不受重复文本、空块、列表、表格、frontmatter 影响。
- 原始源码（edit）模式的插入行为保持不变。
- **BREAKING（内部机制，非对外 API）：** 一旦链接插入完成迁移，viewer 模式的 `viewer → edit → viewer` 往返及 DOM 选区到源码偏移的映射子系统（`prepareMarkdownSelectionFromViewer`、`captureRenderableMarkdownSelection`、`resolveMarkdownSourceSelection`、空块兜底）将针对 viewer 操作被移除。
- 更新架构文档：在全局类图（`workspace.dsl`）与 `ARCHITECTURE.zh-CN.md` 中体现"一个语义命令、两个原生后端（viewer 用 ProseMirror / edit 用 textarea 源码）、按当前界面分发"的模型。

## Capabilities

### New Capabilities
<!-- 无。本次为对已有行为的重构，不引入新能力。"就地命令 / 原生后端"属于实现层关注点，记录在 design.md，而非作为 spec capability。 -->

### Modified Capabilities
- `knowledge-workspace`：细化 Markdown 链接插入 requirement 与 Markdown 样式（高亮）插入 requirement，使其在 viewer 模式下作用于用户的活动选区、保持视口、且不往返原始源码模式，同时仍产出相同的序列化 Markdown（`[label](href)`、`==...==`）。

## Impact

- 代码：`packages/ui/src/utils/markdownDocument.ts`（新增 ProseMirror 命令）、`packages/ui/src/document-viewers/MarkdownDocumentViewer.vue`（暴露就地命令、分发、滚动保护清理）、`packages/ui/src/components/DocumentEditorPane.vue`（将 viewer 操作路由到就地命令）。
- 测试：`packages/ui` 相关组件/工具的单测；viewer 模式高亮与链接插入的 e2e 覆盖（视口稳定 + 落点正确）。
- 规格：`knowledge-workspace`（修改）。
- 文档：`workspace.dsl` 全局类图与 `ARCHITECTURE.zh-CN.md`。
- 依赖：复用既有的 `@milkdown/kit/prose/commands`（`toggleMark`）与 `editorViewCtx`；无新增运行时依赖。
