> **语言**: [English](spec.md) | 中文

## MODIFIED Requirements

### Requirement: Knowledge workspace MUST provide a Markdown link insertion UI for existing Agent-scope documents
知识工作区 Markdown 编辑器 MUST 让用户通过 UI 选择器插入指向已有 Markdown 文档的链接，而不要求手写 Markdown 语法。选择器 MUST 复用当前 Agent 作用域的 Markdown 文档集合，且插入的链接 MUST 以相对 Markdown 路径指向所选文档。在渲染态 viewer 模式下，插入 MUST 作用于用户的活动选区（或光标），并 MUST 保持视口，不切换到原始源码 edit 模式。

#### Scenario: Insert a link from the editor toolbar chooser
- **WHEN** 用户正在知识工作区中编辑一个 Markdown 文档
- **AND** 当前 Agent 作用域至少包含一个其他 Markdown 文档
- **THEN** 编辑器 MUST 提供一个链接插入 UI 入口
- **AND** 选择目标文档 MUST 在当前选区或光标处插入该文档的 Markdown 链接语法

#### Scenario: Wrap the current selection when inserting a chosen link
- **WHEN** 用户在 Markdown 编辑器中选中了一段文本
- **AND** 用户从链接插入 UI 中选择一个已有 Markdown 文档
- **THEN** 编辑器 MUST 保留选中文本作为链接标签
- **AND** 插入的 href MUST 以相对于活动文档的相对路径指向所选文档

#### Scenario: Exclude the active document from link choices
- **WHEN** 链接插入 UI 列出候选 Markdown 文档
- **THEN** 正在编辑的活动文档 MUST NOT 作为可选目标出现

#### Scenario: Preserve the viewport and apply at the live selection in viewer mode
- **WHEN** 渲染态 Markdown viewer 已从顶部向下滚动，且用户存在活动选区
- **AND** 用户从链接插入 UI 中选择一个目标文档
- **THEN** 链接 MUST 就地作用于该活动选区
- **AND** viewer 的滚动位置 MUST 保持不变
- **AND** 编辑器 MUST NOT 为执行插入而切换到原始源码 edit 模式

### Requirement: Knowledge workspace MUST provide a Markdown style insertion UI for selected text
知识工作区 Markdown 编辑器 MUST 在工具栏暴露 Markdown 样式插入 UI，使用户无需手写格式标记即可对已编写文本应用 Markdown 样式。该样式 UI 后续 MAY 扩展为多个动作；当前阶段 MUST 至少提供高亮（加亮笔）动作，对当前选区应用高亮。在渲染态 viewer 模式下，应用样式 MUST 就地作用于用户的活动选区并 MUST 保持视口，不切换到原始源码 edit 模式；序列化后的 Markdown MUST 仍使用 `==...==` 形式。

#### Scenario: Insert highlight markup from the editor toolbar
- **WHEN** 用户正在知识工作区中编辑一个 Markdown 文档
- **THEN** 编辑器工具栏 MUST 提供一个 Markdown 样式插入入口
- **AND** 选择高亮动作 MUST 在当前光标或选区处应用高亮

#### Scenario: Apply highlight to the current selection
- **WHEN** 用户在 Markdown 编辑器中选中了一段文本
- **AND** 用户从 Markdown 样式插入 UI 中选择高亮动作
- **THEN** 编辑器 MUST 保留这段被选中的文本
- **AND** 该文本序列化后的 Markdown MUST 用 `==` 标记包裹

#### Scenario: Prepare an empty highlight insertion for continued typing
- **WHEN** 用户在 Markdown 编辑器中没有选中文字
- **AND** 用户从 Markdown 样式插入 UI 中选择高亮动作
- **THEN** 编辑器 MUST 准备一个空高亮，使得随后输入的文本被高亮
- **AND** 在原始源码模式下，光标 MUST 落在插入的两组 `==` 标记之间

#### Scenario: Render Obsidian-compatible highlight markup as visible highlight styling
- **WHEN** Markdown 文档中包含用 `==` 包裹的行内文本
- **THEN** Markdown viewer/editor 的渲染链路 MUST 将该片段解析为高亮内容
- **AND** 渲染结果 MUST 以可见的高亮样式呈现这段文本
- **AND** 将渲染后的文档序列化回 Markdown 时 MUST 保持 `==...==` 形式

#### Scenario: Preserve the viewport when applying highlight in viewer mode
- **WHEN** 渲染态 Markdown viewer 已从顶部向下滚动
- **AND** 用户对活动选区应用高亮动作
- **THEN** 高亮 MUST 就地作用于该选区
- **AND** viewer 的滚动位置 MUST 保持不变
- **AND** 编辑器 MUST NOT 为执行该动作而切换到原始源码 edit 模式
