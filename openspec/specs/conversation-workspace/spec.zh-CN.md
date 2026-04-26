English | [Chinese](spec.zh-CN.md) ## MODIFIED Requirements ### Requirement: Workspace shell MUST provide shared history sidebar for chat workspace
The system MUST provide一个高于 `NormalChatView` 与 `CompareChatView` 的共享对话工作台view容器，用于统一承载left-sideconversation边栏、中部聊天内容区域以及普通聊天模式下的right-sidequestion索引区域，并在 Web 与 Extension 两个host中复用一致的暗色沉浸式布局。该容器 MUST keep“local / 外部”一级switch，并在外部view下进一步管理具体 provider 选择；当right-side内容区处于普通聊天活动态时，工作台 MUST syncmountquestion索引panel。对于localhistory来源，工作台还 MUST provide整conversation级starredfilter入口，使the user可以在不离开current workspace 的前提下switch“全部”与“only看starred”两种view。该工作台在 `chatStore.workspaceMode === 'active'` 时 MUST continue作为 Agent 主view的辅助展示层，而在switch到对话模式时 MUST only改变展示方式，不得清空currentconversation或重置已save的 Agent recovery点。 #### Scenario: Render workspace shell in host app
- **WHEN** Web host或扩展hostenter聊天工作台
- **THEN** The system MUST render一个包含可折叠侧边栏和right-side内容区的 workspace 容器
- **AND** 该容器 MUST 负责管理“local / 外部”一级来源switch、外部 provider 二级选择、currentright-sideview的mount以及普通聊天question索引panel的显示状态 #### Scenario: Treat chat mode as an auxiliary view of the active Agent conversation
- **WHEN** the user从 Agent 模式switch到对话模式
- **THEN** The system MUST continue展示current `currentConversation` 的detailsview
- **AND** The system MUST NOT 清空currentconversation或重置 Agent recovery状态 ### Requirement: External workspace MUST provide secondary provider selection
The system MUST 在“外部”来源view中provide二级 provider 选择，至少包含 `ChatGPT`、`Gemini` 与 `外部文件导入` 三个入口。对于声明supporthistorysearch的 provider，工作台 MUST 在left-sideexternal history区域provide一份共享search框；该search框的关键词状态 MUST 在 `chatgpt-web` 与 `gemini-web` 之间共享，并在switch provider 时沿用current关键词重新load新 provider 的result。对于不supportsearch的 provider，工作台 MUST 隐藏该search框。 #### Scenario: Switch external provider within external workspace
- **WHEN** the user已switch到“外部”来源并选择 `ChatGPT` 或 `Gemini`
- **THEN** The system MUST 在不离开current workspace 的前提下刷新left-sideexternal historylist
- **AND** right-side预览行为 MUST continue复用统一的普通聊天预览view #### Scenario: Reuse the shared query when switching searchable providers
- **WHEN** the user在 `chatgpt-web` 或 `gemini-web` 下已提交一个非空search关键词后switch到另一个supportsearch的 provider
- **THEN** 工作台 MUST 保留currentsearch框中的关键词
- **AND** The system MUST 使用该the same关键词对新 provider 重新loadresultlist #### Scenario: Hide search box for non-searchable external providers
- **WHEN** the user在“外部”来源下选择 `外部文件导入`
- **THEN** The system MUST 隐藏external historysearch框
- **AND** The system MUST 触发文件导入流程而不是请求远端historylist ### Requirement: Workspace shell MUST preserve normal and compare views as right-pane content
The system MUST 保留 `NormalChatView` 和 `CompareChatView` 作为right-side内容view，而不是将侧边栏、主题状态和富messagerender逻辑直接耦合进其中任一业务view。 #### Scenario: Switch content view by mode
- **WHEN** the user在聊天工作台中switch普通聊天模式与对比聊天模式
- **THEN** workspace 容器 MUST 在right-side内容区mount对应的 `NormalChatView` 或 `CompareChatView`
- **AND** 侧边栏与工作台级主题状态 MUST continue由 workspace 容器统一持有，而不是随right-sideview销毁重建 ### Requirement: Normal chat view MUST support external-history preview mode
The system MUST allow普通聊天区域enterexternal history预览态，并复用现有messagerender区域显示标准化后的historymessage、attachment与注解内容。 #### Scenario: Preview external conversation in normal pane
- **WHEN** the user在侧边栏点击一条external history记录
- **THEN** The system MUST 在普通聊天区域load该条记录的标准化 `Conversation`
- **AND** 普通聊天区域 MUST enter只读预览态，不得allowcontinue发送message ### Requirement: Normal chat view MUST inline import action in existing input area
The system MUST 在 `NormalChatView` 现有底部操作区域内直接render导入按钮或return按钮，以替代发送input区，而不是依赖独立的导入栏组件。 #### Scenario: Replace input area with inline import action
- **WHEN** 普通聊天区域处于external history预览态
- **THEN** The system MUST 隐藏原有messageinput框、attachment入口和发送按钮
- **AND** The system MUST 在the same区域显示明确的return与导入操作 ### Requirement: Importing previewed history MUST activate local conversation for follow-up
The system MUST 在the user导入external history后，将该对话连同其标准化message、attachment和注解一并save为localconversation，并automaticallyswitch回活动态以support后续continue追问。 #### Scenario: Import previewed conversation and continue chat
- **WHEN** the user在external history预览态点击导入按钮且save成功
- **THEN** The system MUST 将该条标准化 `Conversation` save到local存储
- **AND** The system MUST 将currentconversationswitch为对应的local活动conversation并recovery普通input区 ## ADDED Requirements ### Requirement: Local history sidebar MUST provide manual agent binding for local conversations
The system MUST 在普通对话工作台left-sidelocalhistorylist中，为每条local普通conversationprovide手动 Agent 绑定入口。该入口 MUST support把conversation绑定到current工作区可resolve到的某个 Agent、绑定到default根scope Agent，或清空已有绑定。 #### Scenario: Bind a local conversation to a scoped agent from the sidebar
- **WHEN** the user在left-sidelocalhistory项上打开“绑定 Agent”入口并选择某个 scoped Agent
- **THEN** The system MUST 将该conversation的 `conversation.agentKey` update为所选 Agent 对应的 key
- **AND** 该update MUST 持久化到现有localconversation存储中 #### Scenario: Clear an existing agent binding from the sidebar
- **WHEN** the user在left-sidelocalhistory项上选择“不绑定”
- **THEN** The system MUST 清空该conversation已有的 `conversation.agentKey`
- **AND** 该conversation后续 MUST 不再出现在任何按 `agentKey` 聚合的 Agent conversationlist中 #### Scenario: Load binding candidates from the workspace context
- **WHEN** the user首次打开left-sidelocalhistory项的“绑定 Agent”入口
- **THEN** The system MUST 基于current工作区 `contextProvider.getContext()` return的 `agentConfigs` 构造可选 Agent list
- **AND** 该list MUST 同时包含default根scope Agent 以及current工作区中可resolve到的 scoped agents #### Scenario: Keep normal chat execution semantics unchanged after manual binding
- **WHEN** the user已经为一条local普通conversation手动设置了 `conversation.agentKey`
- **THEN** the user在普通对话工作台continue发送后续message时，The system MUST NOT only因该手动绑定而automaticallyswitch实际执行 Agent
- **AND** 手动绑定 MUST 只影响该conversation在 Agent 相关list中的归属与展示 ### Requirement: Normal chat view MUST support multimodal attachment composition
The system MUST 在普通聊天input区support文件选择、拖拽和剪贴板image粘贴三类attachmentinput方式，并在发送前展示可移除的attachment预览。 #### Scenario: Queue attachments before sending
- **WHEN** the user通过文件选择、拖拽或粘贴向普通聊天input区添加image或文件
- **THEN** The system MUST 在input区上方展示对应的attachment预览卡片
- **AND** the user MUST 可以在发送前移除任一attachment #### Scenario: Reject oversized attachment
- **WHEN** the user添加单个超过 10MB 的attachment
- **THEN** The system MUST 拒绝将其加入发送草稿
- **AND** The system MUST 显示明确的大小限制prompt ### Requirement: Conversation history MUST persist the actual sent request content
The system MUST 以“实际发送了什么”作为the usermessage与后续history重放的sole依据，而不是同时并存一份原始inputbody和另一份实际请求body。任何实际enter某轮请求的automatically工作区上下文，都 MUST 反映在该轮the usermessage的 `content` 与 `attachments` 中。 #### Scenario: Persist an auto-attached current document in user history
- **WHEN** knowledge workspace在发送一条the usermessage时automatically将currentdocument加入实际请求
- **THEN** The system MUST 将该document作为该条the usermessage的attachment持久化到history中
- **AND** 若系统为该document追加了稳定prompt，该prompt MUST 体现在该条the usermessage的最终body中 #### Scenario: Replay follow-up turns from the persisted actual request
- **WHEN** the user基于一条已发送过automatically上下文document的messagecontinue follow-up
- **THEN** 后续 provider history MUST 基于已持久化的the usermessage `content` 与 `attachments` 重放
- **AND** The system MUST NOT 再根据current工作区节点重新推断上一轮实际发送过的上下文 ### Requirement: Assistant message rendering MUST support structured annotations
The system MUST 基于标准化的 `text + annotations` 契约render助手message，并分别supportbody内联注解与块级注解。 #### Scenario: Render cite annotation in assistant message
- **WHEN** 助手message包含 `cite` 注解且其 `range` 指向body中的visibletext
- **THEN** The system MUST 将该段textrender为可识别的引用标记
- **AND** The system MUST 在the user悬停或聚焦时展示引用来源信息 #### Scenario: Render image group annotation in assistant message
- **WHEN** 助手message包含 `image_group` 注解
- **THEN** The system MUST 将其render为独立的image宫格或块级媒体区域
- **AND** The system MUST support点击后enter暗色大图预览 ### Requirement: Workspace thread MUST provide dark minimalist presentation
The system MUST 为共享聊天工作区provide一致的暗色极简视觉呈现，以降低视觉干扰并提升长对话阅读体验。 #### Scenario: Render dark workspace thread
- **WHEN** the userenter共享聊天工作台
- **THEN** The system MUST 使用深色背景、低边框噪声和受控阅读宽度render对话线程
- **AND** 非关键操作按钮 MUST default隐藏并only在 hover 或 focus 时出现 ### Requirement: Sidebar new chat entry MUST use split-button interaction
The system MUST 将left-side“新建聊天”实现为分裂按钮：主按钮用于直接create普通聊天，right-side下拉按钮用于选择聊天模式（普通/对比）。 #### Scenario: Primary click starts normal chat
- **WHEN** the user点击“新建聊天”主按钮区域
- **THEN** The system MUST 立即create普通聊天conversation
- **AND** The system MUST 不弹出模式选择菜单 #### Scenario: Secondary click opens mode menu
- **WHEN** the user点击“新建聊天”right-side下拉按钮
- **THEN** The system MUST 弹出聊天模式菜单并至少provide“普通聊天”和“对比聊天”选项
- **AND** the user选择“对比聊天”后 MUST switch到对比聊天workflow ### Requirement: Sidebar history list MUST remain compact and title-first
The system MUST 以紧凑、title优先的方式展示conversationlist，避免冗余元信息干扰阅读。 #### Scenario: Render compact history row
- **WHEN** 系统在侧边栏renderconversationhistory项
- **THEN** 每一项 MUST 以title为主内容，并使用单行省略策略
- **AND** The system MUST NOT 在history项default展示“local”或日期等辅助text ### Requirement: Workspace thread MUST use role-driven alignment without role labels
The system MUST 使用message对齐和气泡风格区分the user与助手message，而不是在body中显示explicit角色标签。 #### Scenario: Render aligned conversation messages
- **WHEN** conversation线程renderthe user与助手message
- **THEN** the usermessage MUST right-side对齐并使用强调色气泡样式
- **AND** 助手message MUST left-side对齐并以body样式render
- **AND** The system MUST NOT 在messagebody前render `YOU` 或 `ASSISTANT` 字样 ### Requirement: Citation rendering MUST provide inline clickable references
The system MUST 将引用标注作为body内联可点击链接render，而不是only在message末尾附加编号按钮list。 #### Scenario: Render inline citation links
- **WHEN** 助手message包含可resolve URL 的 `cite` 注解
- **THEN** The system MUST 在注解对应的body位置render可点击引用链接
- **AND** 点击后 MUST navigation到对应来源页面 ### Requirement: Normal chat workspace MUST integrate question index panel with conversation state
The system MUST 在普通聊天活动态下将currentconversation中的question索引panel与main threadrender绑定到the same份conversation状态；当工作台switch到external history预览态或对比模式时，The system MUST 隐藏或停用question索引panel，而不是continue展示过期索引内容。 #### Scenario: Show question index only for active normal chat
- **WHEN** the user处于普通聊天活动态且currentconversation存在至少一条the userquestion
- **THEN** 工作台 MUST render该conversation的question索引panel
- **AND** 当the userswitch到对比模式或外部预览态时，工作台 MUST 停止展示活动conversation的question索引 ### Requirement: Normal chat input MUST follow desktop composition shortcuts
The system MUST 将普通聊天input区实现为标准桌面text编辑交互：按下 `Enter` 时only执行换行，按下 `Ctrl + Enter` 或 `Cmd + Enter` 时才发送current草稿。The system MUST 在input区域providevisible的快捷键prompt，明确告知换行和发送rule。 #### Scenario: Insert newline with bare Enter
- **WHEN** the user在普通聊天input框中按下 `Enter` 且未同时按下 `Ctrl` 或 `Meta`
- **THEN** The system MUST 在input框中插入换行
- **AND** The system MUST NOT 立即发送message #### Scenario: Send message with modifier shortcut
- **WHEN** the user在普通聊天input框中按下 `Ctrl + Enter` 或 `Cmd + Enter`
- **THEN** The system MUST 发送current草稿message
- **AND** input区域 MUST continue保留快捷键promptcopy ### Requirement: Aborting generation MUST restore the submitted draft
当普通聊天正在生成助手回复时，The system MUST 将发送按钮switch为“停止”。the user点击停止后，The system MUST 中断current生成流程，并把刚刚提交的the userprompt词重新填回input框，同时automaticallyrecoveryinput焦点，以便the usercontinue编辑后重发。 #### Scenario: Stop generation and refill prompt
- **WHEN** the user在助手流式回复过程中点击“停止”
- **THEN** The system MUST 立即中断current生成请求
- **AND** The system MUST 将最近一次已提交的the userprompt词回填到input框并automatically聚焦 ### Requirement: Local history sidebar MUST provide hover-only conversation deletion
The system MUST 在left-sidelocalhistorylist中为每条localconversationprovide整conversationdelete入口，但该入口 MUST only在条目enter hover 或键盘 focus 态时显示，以维持紧凑、title优先的侧边栏视觉。delete入口 MUST 不出现在external history预览list中。 #### Scenario: Reveal delete action only on active history row
- **WHEN** the user将鼠标悬停到某条localhistory项上，或通过键盘聚焦该条目
- **THEN** The system MUST 在该条目的操作区显示“delete”按钮
- **AND** 未处于 hover 或 focus 态的其他history项 MUST NOT 常驻显示该按钮 #### Scenario: Delete current conversation from sidebar
- **WHEN** the user在left-sidelocalhistory项上确认deletecurrent活动conversation
- **THEN** The system MUST delete该整条conversation并从left-sidelist中移除
- **AND** 工作台 MUST automaticallyswitch到剩余最近一条localconversation，若不存在剩余conversation则 MUST create新的空白conversation #### Scenario: Sidebar delete is unavailable for external preview rows
- **WHEN** the userswitch到external history来源list
- **THEN** The system MUST NOT 为这些external history项显示localconversationdelete按钮
- **AND** delete入口 MUST only作用于local持久化的conversation记录 ### Requirement: Sidebar history list MUST support conversation-level starring for local conversations
The system MUST allowthe user在left-sidelocalhistorylist中对整条localconversation执行starred或取消starred操作，并让该状态在刷新、重开conversation与后续list筛selectedkeep一致。该capability MUST only作用于localconversation，不得扩展到external history预览list。 #### Scenario: Toggle star state for a local conversation from the sidebar
- **WHEN** the user在left-side某条localconversationhistory项上点击starred操作
- **THEN** The system MUST switch该conversation的整conversationstarred状态并持久化save
- **AND** 该conversation在侧边栏中 MUST 立即呈现对应的已starred或未starred视觉反馈 #### Scenario: Keep starred state available after reopening the workspace
- **WHEN** the user为一条localconversation设置了starred并在之后重新打开应用或重新enter对话工作台
- **THEN** The system MUST recovery该conversation的starred状态
- **AND** 顶部“only看starred”filter MUST continue可以基于该持久化状态工作 #### Scenario: Do not expose conversation starring for external history rows
- **WHEN** the userswitch到external history来源list
- **THEN** The system MUST NOT 为这些external history项显示整conversationstarred操作
- **AND** starredfilter入口 MUST only影响localhistorylist ### Requirement: Normal chat workspace MUST render model-specific option controls
The system MUST 在普通聊天活动态下，根据currentselectedmodel动态rendermodel功能选项控件，并且这些控件 MUST 与currentmodeldirectory声明keep一致。 #### Scenario: Show model option controls for supported model
- **WHEN** the user位于普通聊天活动态，且currentmodeldirectory为所选model声明了一个或多个功能选项
- **THEN** The system MUST 在普通聊天input区展示对应的 toggle 控件
- **AND** 每个 toggle 的图标、可操作状态以及可通过 tooltip 或 `aria-label` 获取的文字说明 MUST 直接反映currentmodel的 option 元数据 #### Scenario: Hide model option controls when model has no options
- **WHEN** the usercurrentselected的model未声明任何功能选项
- **THEN** The system MUST 不rendermodel功能选项区域
- **AND** 普通聊天input区 MUST continuekeep现有发送交互 #### Scenario: Disable model option controls while chat input is unavailable
- **WHEN** 普通聊天处于生成中、未鉴权或current Provider modeldirectory仍在load
- **THEN** The system MUST 禁用model功能选项控件
- **AND** 这些控件 MUST 与 Provider/Model selectorkeep一致的不可编辑状态 ### Requirement: Normal chat workspace MUST persist and restore conversation model selection
The system MUST 将普通聊天conversation的 `providerId`、`modelId` 与功能选项作为conversation级状态save，并在the userswitch或重新打开该conversation时recovery。 #### Scenario: Restore saved model selection when opening a conversation
- **WHEN** the user重新打开一条已save了 `modelSelection` 的local普通聊天conversation
- **THEN** The system MUST recovery该conversation上次使用的 `providerId`、`modelId` 与已启用功能选项
- **AND** 后续新message MUST default沿用该recovery后的configuration #### Scenario: Drop incompatible options after switching model
- **WHEN** the user在currentconversation中switch到另一model，而新model不support此前启用的部分功能项
- **THEN** The system MUST automatically移除这些不compatible功能项
- **AND** The system MUST only保留新model仍support的启用项，并补上该model声明为default开启的选项 #### Scenario: Resolve conflicting options through normalized conversation state
- **WHEN** the user在currentconversation中启用一个与已有启用项存在冲突关系的功能项
- **THEN** The system MUST automatically关闭冲突项并savenormalize后的conversationconfiguration
- **AND** 发送链路 MUST 只消费normalize后的功能选项集合 ### Requirement: Normal chat view MUST surface host recovery actions for recoverable external-history failures
The system MUST allow共享工作台在external history出现可recoveryhosterror时，通过普通聊天预览区域展示hostrecoverycopy和操作按钮，而不是只显示staticerrorprompt。首个recovery场景 MUST support `gemini-web` 的 `AUTH_REQUIRED`。 #### Scenario: Render a host recovery action for Gemini auth failure
- **WHEN** 工作台current处于 `gemini-web` external historylist或预览态，且error码为 `AUTH_REQUIRED`
- **THEN** `NormalChatView` MUST 在error区域显示hostrecoverycopy和 `登录 Gemini` 操作
- **AND** 普通聊天input区 MUST continuekeep禁用或隐藏状态，直到recovery流程完成 #### Scenario: Bubble the recovery request to the host application
- **WHEN** the user点击external historyerror区域中的hostrecovery按钮
- **THEN** `NormalChatView` MUST 发出 `request-host-recovery`
- **AND** `ConversationWorkspaceView` MUST continue向host应用透传该事件，而不是在shared UI 内直接处理 desktop 专属逻辑

### Requirement: Conversation workspace MUST expose archive only for agent-bound Markdown documents
The conversation workspace MUST expose an archive action in `NormalChatView` only when the workspace is in agent mode and the currently selected node is the active writable Markdown document. The action MUST NOT be shown for normal chat mode, compare mode, external preview mode, directory selections, non-Markdown files, or read-only documents.

#### Scenario: Show archive action for the active agent Markdown document
- **WHEN** `chatStore.workspaceMode` is `agent`
- **AND** the selected node path matches the active document path
- **AND** the active document MIME type is `text/markdown`
- **AND** the active document is writable
- **THEN** the system MUST render an archive action in `NormalChatView`

#### Scenario: Hide archive action outside eligible archive context
- **WHEN** the workspace is not in agent mode, or the selected node is not the active writable Markdown document
- **THEN** the system MUST NOT render the archive action

### Requirement: Conversation workspace MUST archive without confirmation and preserve chat continuity
When the user triggers archive from an eligible agent conversation, the system MUST execute the archive immediately without a preview-confirmation step. The workspace MUST keep the current conversation view active and provide lightweight completion feedback instead of switching to a dedicated archive preview mode.

#### Scenario: Archive runs immediately from the chat action
- **WHEN** the user clicks the archive action in an eligible agent conversation
- **THEN** the system MUST start the archive operation immediately
- **AND** the system MUST NOT require a preview confirmation before writing the merged document

#### Scenario: Preserve current chat view after archive
- **WHEN** an archive operation succeeds, produces no change, or fails
- **THEN** the system MUST keep the current conversation view mounted
- **AND** the system MUST provide non-blocking success, no-change, or failure feedback in the chat workspace

### Requirement: Conversation workspace MUST display persisted archive state for the current conversation
The conversation workspace MUST show the current conversation's persisted archive state in the chat UI whenever the archive action is relevant, so users can tell whether the conversation has never been archived, is archived and current, or has become stale.

#### Scenario: Show archived status after a successful archive
- **WHEN** the current eligible agent conversation has persisted archive metadata and no later visible messages beyond the archived snapshot
- **THEN** the system MUST display an archived status indicator in `NormalChatView`

#### Scenario: Show stale status after new turns arrive
- **WHEN** the current eligible agent conversation has persisted archive metadata and later gains additional visible messages
- **THEN** the system MUST display a stale archive status indicator in `NormalChatView`

#### Scenario: Show unarchived status before the first archive
- **WHEN** the current eligible agent conversation has no persisted archive metadata
- **THEN** the system MUST display an unarchived status indicator in `NormalChatView`
