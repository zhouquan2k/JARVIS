## MODIFIED Requirements

### Requirement: Workspace shell MUST provide shared history sidebar for chat workspace
系统 MUST 提供一个高于 `NormalChatView` 与 `CompareChatView` 的共享对话工作台视图容器，用于统一承载左侧会话边栏、中部聊天内容区域以及普通聊天模式下的右侧问题索引区域，并在 Web 与 Extension 两个宿主中复用一致的暗色沉浸式布局。该容器 MUST 保持“本地 / 外部”一级切换，并在外部视图下进一步管理具体 provider 选择；当右侧内容区处于普通聊天活动态时，工作台 MUST 同步挂载问题索引面板。

#### Scenario: Render workspace shell in host app
- **WHEN** Web 宿主或扩展宿主进入聊天工作台
- **THEN** 系统 MUST 渲染一个包含可折叠侧边栏和右侧内容区的 workspace 容器
- **AND** 该容器 MUST 负责管理“本地 / 外部”一级来源切换、外部 provider 二级选择、当前右侧视图的挂载以及普通聊天问题索引面板的显示状态

### Requirement: External workspace MUST provide secondary provider selection
系统 MUST 在“外部”来源视图中提供二级 provider 选择，至少包含 `ChatGPT`、`Gemini` 与 `外部文件导入` 三个入口。

#### Scenario: Switch external provider within external workspace
- **WHEN** 用户已切换到“外部”来源并选择 `ChatGPT` 或 `Gemini`
- **THEN** 系统 MUST 在不离开当前 workspace 的前提下刷新左侧外部历史列表
- **AND** 右侧预览行为 MUST 继续复用统一的普通聊天预览视图

#### Scenario: Start external file import from external workspace
- **WHEN** 用户在“外部”来源下选择 `外部文件导入`
- **THEN** 系统 MUST 触发文件导入流程而不是请求远端历史列表
- **AND** 导入成功后系统 MUST 切回本地活动会话视图

### Requirement: Workspace shell MUST preserve normal and compare views as right-pane content
系统 MUST 保留 `NormalChatView` 和 `CompareChatView` 作为右侧内容视图，而不是将侧边栏、主题状态和富消息渲染逻辑直接耦合进其中任一业务视图。

#### Scenario: Switch content view by mode
- **WHEN** 用户在聊天工作台中切换普通聊天模式与对比聊天模式
- **THEN** workspace 容器 MUST 在右侧内容区挂载对应的 `NormalChatView` 或 `CompareChatView`
- **AND** 侧边栏与工作台级主题状态 MUST 继续由 workspace 容器统一持有，而不是随右侧视图销毁重建

### Requirement: Normal chat view MUST support external-history preview mode
系统 MUST 允许普通聊天区域进入外部历史预览态，并复用现有消息渲染区域显示标准化后的历史消息、附件与注解内容。

#### Scenario: Preview external conversation in normal pane
- **WHEN** 用户在侧边栏点击一条外部历史记录
- **THEN** 系统 MUST 在普通聊天区域加载该条记录的标准化 `Conversation`
- **AND** 普通聊天区域 MUST 进入只读预览态，不得允许继续发送消息

### Requirement: Normal chat view MUST inline import action in existing input area
系统 MUST 在 `NormalChatView` 现有底部操作区域内直接渲染导入按钮或返回按钮，以替代发送输入区，而不是依赖独立的导入栏组件。

#### Scenario: Replace input area with inline import action
- **WHEN** 普通聊天区域处于外部历史预览态
- **THEN** 系统 MUST 隐藏原有消息输入框、附件入口和发送按钮
- **AND** 系统 MUST 在同一区域显示明确的返回与导入操作

### Requirement: Importing previewed history MUST activate local conversation for follow-up
系统 MUST 在用户导入外部历史后，将该对话连同其标准化消息、附件和注解一并保存为本地会话，并自动切换回活动态以支持后续继续追问。

#### Scenario: Import previewed conversation and continue chat
- **WHEN** 用户在外部历史预览态点击导入按钮且保存成功
- **THEN** 系统 MUST 将该条标准化 `Conversation` 保存到本地存储
- **AND** 系统 MUST 将当前会话切换为对应的本地活动会话并恢复普通输入区

## ADDED Requirements

### Requirement: Normal chat view MUST support multimodal attachment composition
系统 MUST 在普通聊天输入区支持文件选择、拖拽和剪贴板图片粘贴三类附件输入方式，并在发送前展示可移除的附件预览。

#### Scenario: Queue attachments before sending
- **WHEN** 用户通过文件选择、拖拽或粘贴向普通聊天输入区添加图片或文件
- **THEN** 系统 MUST 在输入区上方展示对应的附件预览卡片
- **AND** 用户 MUST 可以在发送前移除任一附件

#### Scenario: Reject oversized attachment
- **WHEN** 用户添加单个超过 10MB 的附件
- **THEN** 系统 MUST 拒绝将其加入发送草稿
- **AND** 系统 MUST 显示明确的大小限制提示

### Requirement: Assistant message rendering MUST support structured annotations
系统 MUST 基于标准化的 `text + annotations` 契约渲染助手消息，并分别支持正文内联注解与块级注解。

#### Scenario: Render cite annotation in assistant message
- **WHEN** 助手消息包含 `cite` 注解且其 `range` 指向正文中的可见文本
- **THEN** 系统 MUST 将该段文本渲染为可识别的引用标记
- **AND** 系统 MUST 在用户悬停或聚焦时展示引用来源信息

#### Scenario: Render image group annotation in assistant message
- **WHEN** 助手消息包含 `image_group` 注解
- **THEN** 系统 MUST 将其渲染为独立的图片宫格或块级媒体区域
- **AND** 系统 MUST 支持点击后进入暗色大图预览

### Requirement: Workspace thread MUST provide dark minimalist presentation
系统 MUST 为共享聊天工作区提供一致的暗色极简视觉呈现，以降低视觉干扰并提升长对话阅读体验。

#### Scenario: Render dark workspace thread
- **WHEN** 用户进入共享聊天工作台
- **THEN** 系统 MUST 使用深色背景、低边框噪声和受控阅读宽度渲染对话线程
- **AND** 非关键操作按钮 MUST 默认隐藏并仅在 hover 或 focus 时出现

### Requirement: Sidebar new chat entry MUST use split-button interaction
系统 MUST 将左侧“新建聊天”实现为分裂按钮：主按钮用于直接创建普通聊天，右侧下拉按钮用于选择聊天模式（普通/对比）。

#### Scenario: Primary click starts normal chat
- **WHEN** 用户点击“新建聊天”主按钮区域
- **THEN** 系统 MUST 立即创建普通聊天会话
- **AND** 系统 MUST 不弹出模式选择菜单

#### Scenario: Secondary click opens mode menu
- **WHEN** 用户点击“新建聊天”右侧下拉按钮
- **THEN** 系统 MUST 弹出聊天模式菜单并至少提供“普通聊天”和“对比聊天”选项
- **AND** 用户选择“对比聊天”后 MUST 切换到对比聊天工作流

### Requirement: Sidebar history list MUST remain compact and title-first
系统 MUST 以紧凑、标题优先的方式展示会话列表，避免冗余元信息干扰阅读。

#### Scenario: Render compact history row
- **WHEN** 系统在侧边栏渲染会话历史项
- **THEN** 每一项 MUST 以标题为主内容，并使用单行省略策略
- **AND** 系统 MUST NOT 在历史项默认展示“本地”或日期等辅助文本

### Requirement: Workspace thread MUST use role-driven alignment without role labels
系统 MUST 使用消息对齐和气泡风格区分用户与助手消息，而不是在正文中显示显式角色标签。

#### Scenario: Render aligned conversation messages
- **WHEN** 会话线程渲染用户与助手消息
- **THEN** 用户消息 MUST 右侧对齐并使用强调色气泡样式
- **AND** 助手消息 MUST 左侧对齐并以正文样式渲染
- **AND** 系统 MUST NOT 在消息正文前渲染 `YOU` 或 `ASSISTANT` 字样

### Requirement: Citation rendering MUST provide inline clickable references
系统 MUST 将引用标注作为正文内联可点击链接渲染，而不是仅在消息末尾附加编号按钮列表。

#### Scenario: Render inline citation links
- **WHEN** 助手消息包含可解析 URL 的 `cite` 注解
- **THEN** 系统 MUST 在注解对应的正文位置渲染可点击引用链接
- **AND** 点击后 MUST 导航到对应来源页面

### Requirement: Normal chat workspace MUST integrate question index panel with conversation state
系统 MUST 在普通聊天活动态下将当前会话中的问题索引面板与主线程渲染绑定到同一份会话状态；当工作台切换到外部历史预览态或对比模式时，系统 MUST 隐藏或停用问题索引面板，而不是继续展示过期索引内容。

#### Scenario: Show question index only for active normal chat
- **WHEN** 用户处于普通聊天活动态且当前会话存在至少一条用户问题
- **THEN** 工作台 MUST 渲染该会话的问题索引面板
- **AND** 当用户切换到对比模式或外部预览态时，工作台 MUST 停止展示活动会话的问题索引

### Requirement: Normal chat input MUST follow desktop composition shortcuts
系统 MUST 将普通聊天输入区实现为标准桌面文本编辑交互：按下 `Enter` 时仅执行换行，按下 `Ctrl + Enter` 或 `Cmd + Enter` 时才发送当前草稿。系统 MUST 在输入区域提供可见的快捷键提示，明确告知换行和发送规则。

#### Scenario: Insert newline with bare Enter
- **WHEN** 用户在普通聊天输入框中按下 `Enter` 且未同时按下 `Ctrl` 或 `Meta`
- **THEN** 系统 MUST 在输入框中插入换行
- **AND** 系统 MUST NOT 立即发送消息

#### Scenario: Send message with modifier shortcut
- **WHEN** 用户在普通聊天输入框中按下 `Ctrl + Enter` 或 `Cmd + Enter`
- **THEN** 系统 MUST 发送当前草稿消息
- **AND** 输入区域 MUST 继续保留快捷键提示文案

### Requirement: Aborting generation MUST restore the submitted draft
当普通聊天正在生成助手回复时，系统 MUST 将发送按钮切换为“停止”。用户点击停止后，系统 MUST 中断当前生成流程，并把刚刚提交的用户提示词重新填回输入框，同时自动恢复输入焦点，以便用户继续编辑后重发。

#### Scenario: Stop generation and refill prompt
- **WHEN** 用户在助手流式回复过程中点击“停止”
- **THEN** 系统 MUST 立即中断当前生成请求
- **AND** 系统 MUST 将最近一次已提交的用户提示词回填到输入框并自动聚焦

### Requirement: Local history sidebar MUST provide hover-only conversation deletion
系统 MUST 在左侧本地历史列表中为每条本地会话提供整会话删除入口，但该入口 MUST 仅在条目进入 hover 或键盘 focus 态时显示，以维持紧凑、标题优先的侧边栏视觉。删除入口 MUST 不出现在外部历史预览列表中。

#### Scenario: Reveal delete action only on active history row
- **WHEN** 用户将鼠标悬停到某条本地历史项上，或通过键盘聚焦该条目
- **THEN** 系统 MUST 在该条目的操作区显示“删除”按钮
- **AND** 未处于 hover 或 focus 态的其他历史项 MUST NOT 常驻显示该按钮

#### Scenario: Delete current conversation from sidebar
- **WHEN** 用户在左侧本地历史项上确认删除当前活动会话
- **THEN** 系统 MUST 删除该整条会话并从左侧列表中移除
- **AND** 工作台 MUST 自动切换到剩余最近一条本地会话，若不存在剩余会话则 MUST 创建新的空白会话

#### Scenario: Sidebar delete is unavailable for external preview rows
- **WHEN** 用户切换到外部历史来源列表
- **THEN** 系统 MUST NOT 为这些外部历史项显示本地会话删除按钮
- **AND** 删除入口 MUST 仅作用于本地持久化的会话记录

### Requirement: Normal chat workspace MUST render model-specific option controls
系统 MUST 在普通聊天活动态下，根据当前选中模型动态渲染模型功能选项控件，并且这些控件 MUST 与当前模型目录声明保持一致。

#### Scenario: Show model option controls for supported model
- **WHEN** 用户位于普通聊天活动态，且当前模型目录为所选模型声明了一个或多个功能选项
- **THEN** 系统 MUST 在普通聊天输入区展示对应的 toggle 控件
- **AND** 每个 toggle 的图标、可操作状态以及可通过 tooltip 或 `aria-label` 获取的文字说明 MUST 直接反映当前模型的 option 元数据

#### Scenario: Hide model option controls when model has no options
- **WHEN** 用户当前选中的模型未声明任何功能选项
- **THEN** 系统 MUST 不渲染模型功能选项区域
- **AND** 普通聊天输入区 MUST 继续保持现有发送交互

#### Scenario: Disable model option controls while chat input is unavailable
- **WHEN** 普通聊天处于生成中、未鉴权或当前 Provider 模型目录仍在加载
- **THEN** 系统 MUST 禁用模型功能选项控件
- **AND** 这些控件 MUST 与 Provider/Model 选择器保持一致的不可编辑状态

### Requirement: Normal chat workspace MUST persist and restore conversation model selection
系统 MUST 将普通聊天会话的 `providerId`、`modelId` 与功能选项作为会话级状态保存，并在用户切换或重新打开该会话时恢复。

#### Scenario: Restore saved model selection when opening a conversation
- **WHEN** 用户重新打开一条已保存了 `modelSelection` 的本地普通聊天会话
- **THEN** 系统 MUST 恢复该会话上次使用的 `providerId`、`modelId` 与已启用功能选项
- **AND** 后续新消息 MUST 默认沿用该恢复后的配置

#### Scenario: Drop incompatible options after switching model
- **WHEN** 用户在当前会话中切换到另一模型，而新模型不支持此前启用的部分功能项
- **THEN** 系统 MUST 自动移除这些不兼容功能项
- **AND** 系统 MUST 仅保留新模型仍支持的启用项，并补上该模型声明为默认开启的选项

#### Scenario: Resolve conflicting options through normalized conversation state
- **WHEN** 用户在当前会话中启用一个与已有启用项存在冲突关系的功能项
- **THEN** 系统 MUST 自动关闭冲突项并保存规范化后的会话配置
- **AND** 发送链路 MUST 只消费规范化后的功能选项集合
