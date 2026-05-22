## ADDED Requirements

### Requirement: Knowledge workspace MUST provide a Markdown conversation-link insertion UI for current Agent conversations
知识工作区的 Markdown 编辑器 MUST 为 Markdown 文档提供一个专门的“对话链接插入”入口。该选择器 MUST 复用当前 Agent 作用域内的本地对话，插入后的 Markdown href MUST 只标识被选择的 conversation，而不是更细粒度的位置。

#### Scenario: Insert a conversation link from the toolbar chooser
- **WHEN** 用户正在知识工作区中编辑一份 Markdown 文档
- **AND** 当前 Agent 作用域下至少存在一条本地对话
- **THEN** 编辑器 MUST 暴露一个“插入对话链接”的入口
- **AND** 当用户选择一条对话后，系统 MUST 在当前光标位置插入该对话对应的 Markdown 链接语法

#### Scenario: Wrap the current selection when inserting a chosen conversation link
- **WHEN** 用户在 Markdown 编辑器中选中了一段文本
- **AND** 用户通过“插入对话链接”UI 选择了一条对话
- **THEN** 编辑器 MUST 保留当前选中文本作为链接文本
- **AND** 插入的 href MUST 只编码目标 conversation 身份，而不是任何问题级位置

#### Scenario: Disable the action when no local conversations are linkable
- **WHEN** 用户正在知识工作区中编辑一份 Markdown 文档
- **AND** 当前 Agent 作用域下不存在可供链接的本地对话
- **THEN** “插入对话链接”入口 MUST 处于不可插入状态
- **AND** 编辑器 MUST NOT 迫使用户手工编写应用内对话 href

### Requirement: Knowledge workspace MUST route clicked Markdown conversation links to the right-side Agent pane
当一个渲染后的 Markdown 链接被解析为工作区 conversation href 时，知识工作区 MUST 将它视为一次内部对话导航动作。打开该对话时 MUST NOT 替换当前中栏活动文档。

#### Scenario: Open a linked conversation from the Markdown viewer
- **WHEN** 用户点击一个渲染后的 Markdown 链接，且该链接标识的是当前 Agent 作用域中的一条本地对话
- **THEN** 工作区 MUST 请求右侧 Agent pane 打开该对话
- **AND** 中栏当前活动文档 MUST 保持打开

#### Scenario: Ignore unsupported or unavailable conversation links safely
- **WHEN** 用户点击一个渲染后的 Markdown 链接，但它指向的对话不存在、已删除或不属于当前 Agent 作用域
- **THEN** 工作区 MUST NOT 替换当前活动文档
- **AND** 工作区 MUST NOT 破坏当前对话或文档状态
