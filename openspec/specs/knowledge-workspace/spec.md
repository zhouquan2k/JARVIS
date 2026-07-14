English | [Chinese](spec.zh-CN.md)

## Purpose
Define knowledge workspace behavior for document viewing and editing, agent-scoped assistant flows, viewer search, save-state feedback, default index documents, and workspace-backed file reference resolution.
## Requirements
### Requirement: Knowledge workspace MUST automatically title new Agent-pane conversations from the first question
The knowledge workspace MUST apply the same first-question automatic naming behavior to local conversations created from the right-side Agent pane. Generated titles MUST persist on the local conversation and MUST appear in the Agent conversation list and conversation detail header after the first successful send.

#### Scenario: Title a newly created Agent conversation after the first send
- **WHEN** the user creates a new local conversation from the Agent pane in the knowledge workspace
- **AND** that conversation still has the placeholder title `New Chat`
- **AND** the first user question is sent successfully
- **THEN** the system MUST generate a concise title from that first question
- **AND** the system MUST persist and display that generated title in the Agent-pane conversation surfaces

#### Scenario: Fall back locally when provider-side title generation is unavailable
- **WHEN** the Agent-pane conversation first send succeeds
- **AND** the active provider cannot generate a title or title generation fails
- **THEN** the system MUST keep the successful assistant response
- **AND** the system MUST apply a deterministic local fallback title to the conversation

### Requirement: Knowledge workspace MUST normalize Markdown filenames in AgentMode file trees
The knowledge workspace AgentMode file tree MUST treat Markdown filenames as a display concern: new file creation MUST append `.md` when the user does not provide an extension, file tree labels MUST hide the `.md` suffix by default, and non-Markdown files MUST show a file-type icon in the tree. This behavior MUST not change the underlying filesystem path or document identity.

#### Scenario: Auto-append `.md` when creating a new Markdown file
- **WHEN** the user creates a new file from the AgentMode file tree
- **AND** the entered name does not include a filename extension
- **THEN** the system MUST create the file with a `.md` suffix
- **AND** the created node MUST resolve to the Markdown document path in the workspace

#### Scenario: Hide `.md` in the default display name
- **WHEN** the AgentMode file tree renders a Markdown file node
- **THEN** the displayed label MUST hide the `.md` suffix by default
- **AND** the underlying node path MUST remain unchanged

#### Scenario: Show file-type icons for non-Markdown files
- **WHEN** the AgentMode file tree renders a non-Markdown file node
- **THEN** the tree MUST display a file-type icon for that node
- **AND** the node label MUST keep the original filename

### Requirement: Knowledge workspace MUST provide a Markdown link insertion UI for existing Agent-scope documents
The knowledge workspace Markdown editor MUST let users insert links to existing Markdown documents through a UI chooser instead of requiring manual Markdown syntax entry. The chooser MUST reuse the current Agent-scope Markdown document collection, and inserted links MUST target the chosen document with a relative Markdown path. In rendered viewer mode, insertion MUST apply at the user's live selection (or caret) and MUST preserve the viewport, without switching to raw-source edit mode.

#### Scenario: Insert a link from the editor toolbar chooser
- **WHEN** the user is editing a Markdown document in the knowledge workspace
- **AND** the current Agent scope contains at least one other Markdown document
- **THEN** the editor MUST offer a link insertion UI entry
- **AND** choosing a target document MUST insert Markdown link syntax for that document at the current selection or caret

#### Scenario: Wrap the current selection when inserting a chosen link
- **WHEN** the user has selected text in the Markdown editor
- **AND** the user chooses an existing Markdown document from the link insertion UI
- **THEN** the editor MUST preserve the selected text as the link label
- **AND** the inserted href MUST point to the chosen document using a relative path from the active document

#### Scenario: Exclude the active document from link choices
- **WHEN** the link insertion UI lists candidate Markdown documents
- **THEN** the active document being edited MUST NOT appear as a selectable target

#### Scenario: Preserve the viewport and apply at the live selection in viewer mode
- **WHEN** the rendered Markdown viewer is scrolled away from the top and the user has a live selection
- **AND** the user chooses a target document from the link insertion UI
- **THEN** the link MUST be applied over that live selection in place
- **AND** the viewer's scroll position MUST remain unchanged
- **AND** the editor MUST NOT switch to raw-source edit mode to perform the insertion

### Requirement: Knowledge workspace MUST provide a Markdown style insertion UI for selected text
The knowledge workspace Markdown editor MUST expose a toolbar style insertion UI for authored Markdown text transformations so users do not need to type formatting markers manually. The style UI MAY offer multiple actions over time; initially it MUST provide a highlight action that applies highlight to the current selection. In rendered viewer mode, applying a style MUST act on the user's live selection in place and MUST preserve the viewport, without switching to raw-source edit mode; the serialized Markdown MUST still use the `==...==` form.

#### Scenario: Insert highlight markup from the editor toolbar
- **WHEN** the user is editing a Markdown document in the knowledge workspace
- **THEN** the editor MUST expose a Markdown style insertion UI entry in the toolbar
- **AND** choosing the highlight action MUST apply highlight at the current caret or selection

#### Scenario: Apply highlight to the current selection
- **WHEN** the user has selected text in the Markdown editor
- **AND** the user chooses the highlight action from the Markdown style insertion UI
- **THEN** the editor MUST preserve the selected text
- **AND** the serialized Markdown for that text MUST be wrapped with `==` markers

#### Scenario: Prepare an empty highlight insertion for continued typing
- **WHEN** the user has no selected text in the Markdown editor
- **AND** the user chooses the highlight action from the Markdown style insertion UI
- **THEN** the editor MUST prepare an empty highlight so that text typed next is highlighted
- **AND** in raw-source mode the caret MUST land between the inserted `==` markers

#### Scenario: Render Obsidian-compatible highlight markup as visible highlight styling
- **WHEN** a Markdown document contains inline text wrapped with `==` markers
- **THEN** the Markdown viewer/editor rendering pipeline MUST parse that range as highlight content
- **AND** the rendered output MUST present the wrapped text with visible highlight styling
- **AND** serializing the rendered document back to Markdown MUST preserve the `==...==` form

#### Scenario: Preserve the viewport when applying highlight in viewer mode
- **WHEN** the rendered Markdown viewer is scrolled away from the top
- **AND** the user applies the highlight action to a live selection
- **THEN** the highlight MUST be applied in place over that selection
- **AND** the viewer's scroll position MUST remain unchanged
- **AND** the editor MUST NOT switch to raw-source edit mode to perform the action

### Requirement: Knowledge workspace MUST provide a Markdown block insertion UI for block-level constructs
The knowledge workspace Markdown editor MUST expose a separate toolbar block insertion UI, distinct from the inline style picker, for block-level Markdown constructs that cannot be expressed as inline marks. The block insertion UI MUST initially provide a task-list item (checkbox) action. In rendered viewer mode, inserting a block MUST act on the user's live selection in place without switching to raw-source edit mode. When no text is selected, the inserted block MUST include a placeholder text (`task1`) so that the result is immediately visible and editable.

#### Scenario: Insert a task-list item from the block insertion toolbar
- **WHEN** the user is editing a Markdown document in the knowledge workspace
- **THEN** the editor MUST expose a Markdown block insertion UI entry in the toolbar, separate from the inline style picker
- **AND** the block insertion UI MUST include a "Checkbox" (task-list item) action

#### Scenario: Wrap selected text in a task-list item
- **WHEN** the user has selected text in the Markdown editor
- **AND** the user chooses the checkbox action from the block insertion UI
- **THEN** the selected text MUST become the content of a new task-list item (`- [ ] <selected text>`)
- **AND** the resulting Markdown MUST be a valid GFM task-list item

#### Scenario: Insert a placeholder task-list item when there is no selection
- **WHEN** the user has no selected text in the Markdown editor
- **AND** the user chooses the checkbox action from the block insertion UI
- **THEN** the editor MUST insert a task-list item with placeholder text (`- [ ] task1`)

#### Scenario: Insert block without switching to raw-source edit mode in viewer mode
- **WHEN** the Markdown editor is in rendered viewer mode
- **AND** the user invokes the checkbox block insertion
- **THEN** the block MUST be inserted in place via the WYSIWYG ProseMirror layer
- **AND** the editor MUST NOT switch to raw-source edit mode to perform the insertion

### Requirement: Knowledge workspace MUST allow toggling task-list checkboxes directly in viewer mode
The knowledge workspace Markdown viewer MUST allow users to click a rendered task-list checkbox to toggle its checked state without leaving viewer mode. The toggle MUST update the serialized Markdown source immediately so the change is persisted.

#### Scenario: Click a checkbox to toggle its checked state in viewer mode
- **WHEN** the Markdown editor is in rendered viewer mode
- **AND** the rendered document contains task-list items
- **THEN** the checkbox affordance for each task-list item MUST be clickable
- **AND** clicking an unchecked item MUST mark it as checked (`- [x]`) in the Markdown source
- **AND** clicking a checked item MUST mark it as unchecked (`- [ ]`) in the Markdown source
- **AND** the viewport scroll position MUST remain unchanged after the toggle

### Requirement: Knowledge workspace MUST support viewer-mode resizing for local Markdown images
The knowledge workspace Markdown middle-pane viewer MUST let users resize local document images directly from the rendered viewer mode without depending on a new editor-native image sizing contract. The resize interaction MUST persist the chosen Crepe-compatible ratio back into the authored Markdown source and MUST leave unsupported image sources unchanged.

#### Scenario: Resize a local Markdown image from the viewer surface
- **WHEN** the user opens a Markdown document in knowledge workspace viewer mode
- **AND** the rendered content contains a local document image that originated from standard Markdown image syntax or wiki-style image embed syntax
- **THEN** the viewer MUST expose a resize affordance for that image
- **AND** dragging the affordance MUST update the preview width visually
- **AND** releasing the drag MUST persist the selected ratio back into the document source

#### Scenario: Persist ratio through HTML image syntax
- **WHEN** the user completes a resize interaction for a local Markdown image
- **THEN** the system MUST persist the image ratio using an authored representation that preserves the selected scale
- **AND** if the source image is already represented as an HTML `<img>` tag or wiki embed, the system MUST normalize it into the same ratio-based representation instead of duplicating the image entry

#### Scenario: Do not persist ambiguous or unsupported image sources
- **WHEN** the rendered image source cannot be mapped back to a unique source span in the active Markdown document
- **OR** the rendered image uses a remote URL or `data:` URL source
- **THEN** the viewer MUST NOT rewrite the Markdown source automatically
- **AND** the rest of the Markdown viewing experience MUST continue to work without document corruption

### Requirement: Knowledge workspace MUST materialize pasted Markdown images as `references/` files
When a user pastes an image into a Markdown document in the knowledge workspace, the system MUST store that image as a real file under a document-local `references/` directory and MUST insert a Markdown reference to the stored file instead of inlining the image bytes into the document source.

#### Scenario: Paste an image into a Markdown document
- **WHEN** the user pastes an image from the clipboard into an editable Markdown document
- **THEN** the system MUST create or reuse a `references/` directory relative to the active document
- **AND** the system MUST write the pasted image to a file in that directory
- **AND** the system MUST insert Markdown image syntax that references the stored file instead of embedding a `data:` URL in the document

#### Scenario: Keep pasted-image references document-relative
- **WHEN** the system inserts the Markdown reference for a newly pasted image
- **THEN** the inserted path MUST remain relative to the active Markdown document
- **AND** the referenced file MUST resolve through the existing Markdown asset path rules used by the knowledge workspace viewer

#### Scenario: Do not corrupt the document when pasted-image persistence fails
- **WHEN** the image file cannot be written under `references/` for the active document
- **THEN** the system MUST NOT replace the current document content with a large inline image payload automatically
- **AND** the existing Markdown editor content MUST remain intact

### Requirement: Knowledge workspace MUST provide a Markdown conversation-link insertion UI for current Agent conversations
The knowledge workspace Markdown editor MUST provide a dedicated conversation-link insertion action for Markdown documents. The chooser MUST reuse local conversations from the current Agent scope, and the inserted Markdown href MUST identify only the chosen conversation.

#### Scenario: Insert a conversation link from the toolbar chooser
- **WHEN** the user is editing a Markdown document in the knowledge workspace
- **AND** the current Agent scope has at least one local conversation
- **THEN** the editor MUST expose a conversation-link insertion action
- **AND** choosing a conversation MUST insert Markdown link syntax for that conversation at the current cursor position

#### Scenario: Wrap the current selection when inserting a chosen conversation link
- **WHEN** the user has selected text in the Markdown editor
- **AND** the user chooses a conversation from the conversation-link insertion UI
- **THEN** the editor MUST preserve the selected text as the link label
- **AND** the inserted href MUST encode only the target conversation identity rather than any question-level location

#### Scenario: Disable the action when no local conversations are linkable
- **WHEN** the user is editing a Markdown document in the knowledge workspace
- **AND** the current Agent scope has no local conversations that can be linked
- **THEN** the conversation-link insertion action MUST remain unavailable for insertion
- **AND** the editor MUST NOT force the user to hand-author an application conversation href

### Requirement: Knowledge workspace MUST route clicked Markdown conversation links to the right-side Agent pane
When a rendered Markdown link resolves to a workspace conversation href, the knowledge workspace MUST treat it as an internal conversation navigation action. Opening the linked conversation MUST NOT replace the active middle-pane document.

#### Scenario: Open a linked conversation from the Markdown viewer
- **WHEN** the user clicks a rendered Markdown link that identifies a local conversation in the current Agent scope
- **THEN** the workspace MUST request that the right-side Agent pane open that conversation
- **AND** the current active document in the middle pane MUST remain open

#### Scenario: Ignore unsupported or unavailable conversation links safely
- **WHEN** the user clicks a rendered Markdown link whose conversation target is unavailable, deleted, or outside the current Agent scope
- **THEN** the workspace MUST NOT replace the active document
- **AND** the workspace MUST NOT corrupt the current conversation or document state

### Requirement: Knowledge workspace MUST provide a default assistant pane that is bound to the active scope agent
knowledge workspace的右栏 MUST defaultrender真实的 AI 对话 pane，并将其绑定到current激活文件或directoryresolve得到的生效 Agent 上下文，而不是始终以global固定的通用聊天身份运行。该 pane MUST continue复用现有聊天detailsview，但在currentselected节点为document时，右栏 MUST 先enter该document的关联conversationlist，在currentselected节点为绑定 Agent 的directory时，右栏 MUST 先enter该 Agent 的localconversationlist，再由the userswitch到具体conversationdetails。document关联conversationlist MUST 通过 `IContextProvider` provide的通用conversationquerycapability获取，而directory级 Agent conversationlist MUST 复用current `agentKey` scope下的localconversation聚合result，而不是另起一套list实现。该工作区在从对话模式return时 MUST recovery之前save的selected节点、活动路径与currentconversationdetails，使 Agent 主viewcontinue停留在离开前的上下文上。

#### Scenario: Render the default assistant pane with the active scope agent
- **WHEN** hostenterknowledge workspace且current激活节点已经resolve出一个生效 Agent
- **THEN** The system MUST 在右栏renderdefault的 `AgentPane`
- **AND** 该 pane MUST continue复用现有聊天detailsview并通过 `AgentRuntime` 发送current Agent 上下文请求，而不是忽略file treescope

#### Scenario: Pass workspace context with assistant requests
- **WHEN** knowledge workspace右栏 Agent 发送一次请求
- **THEN** The system MUST 将current `activePath`、`contextProvider` 以及可用的 `activeDocument` 一并传给 `AgentRuntime`
- **AND** 后续文件tool执行 MUST 能使用这组工作区上下文

#### Scenario: Restore the saved Agent view state after returning from chat mode
- **WHEN** the user从对话模式切回knowledge workspace
- **THEN** The system MUST recoveryswitch前save的selected节点、活动路径和currentconversationdetails
- **AND** recovery后右栏 MUST continue显示对应节点下的 Agent 对话内容

#### Scenario: Fall back safely when the saved Agent view state is stale
- **WHEN** save的selected节点或conversation在切回knowledge workspace前已经失效
- **THEN** The system MUST fallback到最近可用的父节点或根节点
- **AND** The system MUST keep右栏可continue使用，而不是抛出无法recovery的error态

#### Scenario: Default to a document-scoped conversation list when a document is selected
- **WHEN** the user在knowledge workspacecurrentselected一个document节点
- **THEN** right-side `AgentPane` MUST default显示该document的关联conversationlist，而不是直接enter某条conversationdetails
- **AND** 该list MUST keepcurrent生效 `agentKey` scope，不得混入其他 Agent 的conversation

#### Scenario: Load document-scoped conversations through the context provider
- **WHEN** right-side `AgentPane` 需要展示currentdocument的关联conversationlist
- **THEN** The system MUST 通过 `IContextProvider.getConversations({ documentPath })` read该list
- **AND** UI MUST NOT 直接以local `chatStore.conversations` 作为sole数据源拼装result

#### Scenario: Keep assistant detail mode for directory selections
- **WHEN** the usercurrentselected的是directory节点而不是document节点
- **THEN** right-side `AgentPane` MUST continue显示聊天detailsview
- **AND** The system MUST NOT 因directoryselected态强制enterdocumentconversationlist

#### Scenario: Default to an agent-scoped conversation list when an agent-bound directory is selected
- **WHEN** the user在knowledge workspacecurrentselected一个绑定了 Agent 的directory节点
- **THEN** right-side `AgentPane` MUST default显示属于current `agentKey` 的localconversationlist
- **AND** 该list MUST NOT 混入其他 Agent scope的conversation

#### Scenario: Reuse the existing conversation list component for agent-bound directories
- **WHEN** 系统在right-side `AgentPane` 中展示绑定 Agent 的directory级conversationlist
- **THEN** The system MUST 复用currentlist/details双态panel中的现有conversationlist组件
- **AND** The system MUST NOT 为directory级 Agent conversation再create一套独立的right-sidelist交互

#### Scenario: Include the active document only when the provider accepts its MIME type
- **WHEN** currentknowledge workspace节点是一个文件且右栏 Agent 发起请求
- **THEN** Agent 运行时请求契约 MUST allow程序侧根据model provider 声明的documentcapability决定是否附带该 `activeDocument`
- **AND** 当 provider 未声明接受current `mimeType` 时，The system MUST NOT 把该document内容作为body或attachment直接注入modelinput

#### Scenario: Expose the actual first-turn document input for document association
- **WHEN** 首轮请求真实采纳了currentdocument作为modelinputattachment
- **THEN** The system MUST 将该document作为真实请求的一部分write backcurrent user message 的history记录
- **AND** 后续document关联关系 MUST 基于这份真实请求快照建立，而不是only凭 UI selected态推断

#### Scenario: Follow-up turns replay prior document context from history only
- **WHEN** the sameconversationenter后续 follow-up 提问
- **THEN** The system MUST 优先依赖已持久化的message history 重放先前document上下文
- **AND** The system MUST NOT only因current工作区仍selectedthe same个文件，就再次automatically附加已经存在于 history 中的旧document

#### Scenario: Changing the active node does not retroactively replace conversation context
- **WHEN** the user在conversationcreate后switch了工作区current节点，但没有explicit将新文件添加到对话
- **THEN** The system MUST NOT automatically用新节点替换currentconversation已经固定下来的document上下文
- **AND** 后续请求 MUST continue以history中已记录的真实上下文为准

#### Scenario: Fall back to the root default agent in the assistant pane
- **WHEN** current激活节点及其父directory都不存在 `.agent.json`
- **THEN** 右栏 AI pane MUST 退回到根目录 `/.agent.json` 中持久化的默认 Agent
- **AND** 如果根目录 `/.agent.json` 尚未存在，系统 MUST 在首次需要时创建它并继续使用该 pane
- **AND** the user仍然 MUST 可以continue以普通聊天方式使用该 pane

#### Scenario: Selecting a directory updates the effective assistant agent immediately
- **WHEN** the user在knowledge workspaceleft-side点击一个directory节点，但未打开新文件
- **THEN** The system MUST 立即以该directory路径重新resolve并switch右栏生效 Agent
- **AND** The system MUST NOT 要求the user必须先打开该directory下的文件才update右栏身份

#### Scenario: Show manually bound conversations in the agent-scoped list
- **WHEN** the user在普通对话工作台中将一条localconversation手动绑定到currentdirectory对应的 Agent key
- **THEN** 该conversation MUST 出现在knowledge workspaceright-side `AgentPane` 的current Agent conversationlist中
- **AND** The system MUST NOT 要求该conversation必须由knowledge workspaceautomaticallycreate或automatically绑定后才visible

#### Scenario: Keep an existing conversation bound to its own agent in detail mode
- **WHEN** the user opens an existing conversation detail in the knowledge workspace and that conversation already persists `conversation.agentKey`
- **THEN** follow-up sends MUST use the Agent context resolved from that persisted conversation binding
- **AND** The system MUST NOT override that conversation's Agent tools, instructions, or model selection only because the currently selected tree node resolves to a different Agent

### Requirement: Knowledge workspace MUST surface file changes with line-level undo and redo
knowledge workspace MUST 为文件修订resultprovide diff 展示与行级 undo/redo 入口，以supportthe user理解和fallback Agent 写盘后的变更。

#### Scenario: Show the latest file change as a line diff
- **WHEN** 某个文件修订tool成功修改current工作区文件
- **THEN** UI MUST 能根据修改前后text展示 line diff
- **AND** 该 diff MUST 不依赖 LLM 预先生成补丁数据

#### Scenario: Trigger undo or redo from the workspace UI
- **WHEN** the user在工作区中触发文件 undo 或 redo
- **THEN** The system MUST 通过程序侧文件变更服务write back对应内容
- **AND** write back后再次read该文件时 MUST 能得到update后的text

### Requirement: Knowledge workspace MUST resolve the main pane by document viewer
knowledge workspace MUST 先readcurrentdocument，再根据 `mimeType` 通过统一的 `DocumentViewer` registry resolve主显示区行为，而不是continue在 store 或组件里按扩展名硬编码 `.md` / `.pdf` 分支。

#### Scenario: Resolve markdown and plain text with the same text viewer
- **WHEN** current激活document的 `mimeType` 为 `text/markdown` 或 `text/plain`
- **THEN** The system MUST 使用the same个support编辑的text viewer 打开该document
- **AND** 该 viewer MUST continue复用现有text编辑、automaticallysave、diff 和 undo/redo 链路

#### Scenario: Resolve PDF with a read-only viewer
- **WHEN** current激活document的 `mimeType` 为 `application/pdf`
- **THEN** The system MUST switch到 PDF viewer
- **AND** 该 viewer MUST 只读显示该document，而不是尝试mounttext编辑器

#### Scenario: Fall back when no viewer matches the MIME type
- **WHEN** current激活document的 `mimeType` 未命中任何已注册 viewer
- **THEN** The system MUST 显示明确的“不support此document类型”状态
- **AND** The system MUST NOT 退化为盲目使用 Markdown 编辑器

### Requirement: Knowledge workspace MUST provide a read-only image viewer
knowledge workspace MUST 能通过统一的 `DocumentViewer` registry 将常见image MIME 类型resolve到只读image viewer，并在main panel中显示currentimage文件。该 viewer MUST 复用 `IContextProvider.readDocument()` return的 `mimeType` 与 `dataBase64` 载荷，不得要求独立的imagereadinterface。

#### Scenario: Resolve supported image MIME types with the image viewer
- **WHEN** current激活document的 `mimeType` 为 `image/png`、`image/jpeg`、`image/gif`、`image/svg+xml` 或 `image/webp`
- **THEN** The system MUST 将该documentresolve到 `image` viewer
- **AND** 该 viewer MUST 标记为可查看但不可编辑

#### Scenario: Render the active image document in the main pane
- **WHEN** the user在knowledge workspace打开一个已support的imagedocument
- **THEN** main panel MUST 使用currentdocument的 `mimeType` 与 `dataBase64` 构造可显示的image来源
- **AND** image MUST 在main panelvisible区域内自适应显示，而不是撑破三栏布局

#### Scenario: Keep image documents out of text editing flows
- **WHEN** current激活document由 `image` viewer 打开
- **THEN** The system MUST 禁用save入口并keeptext草稿内容为空
- **AND** The system MUST NOT mount Markdown/text 编辑器、Markdown 模式switch、diff、undo 或 redo 交互

#### Scenario: Preserve unsupported fallback for non-registered image-like files
- **WHEN** current激活document的 `mimeType` 未命中任何已注册 viewer
- **THEN** The system MUST continue显示明确的“不support此document类型”状态
- **AND** The system MUST NOT 因文件看起来像image就绕过 MIME registry 强行render

### Requirement: Knowledge workspace MUST provide inline file tree operations
knowledge workspaceleft-sidefile tree MUST support直接面向current树节点的文件操作，而不是依赖浏览器原生 `prompt/confirm` 或隐式刷新。该交互 MUST support树内原位新建、explicit刷新、带确认的delete和双击改名。

#### Scenario: Create a file or directory inline inside the tree
- **WHEN** the user点击file tree中的“新建文件”或“新建directory”
- **THEN** The system MUST 在目标父directory下插入一个临时树节点并直接enter原位编辑
- **AND** the user MUST 能通过 `Enter` 提交、`Escape` 取消，且空input失焦 MUST 取消该create

#### Scenario: Resolve the parent directory for inline creation from the current selection
- **WHEN** the user从file tree触发新建操作
- **THEN** 若currentselected节点是directory，The system MUST 将新节点create到该directory下
- **AND** 若currentselected节点是文件，The system MUST 将新节点create到该文件的父directory下
- **AND** 若currentselected根节点 `/`，The system MUST 将新节点create到工作区根directory

#### Scenario: Refresh the file tree explicitly
- **WHEN** the user点击file tree中的刷新按钮
- **THEN** The system MUST 重新loadcurrent工作区directory树
- **AND** 刷新后 MUST 尽量保留仍然存在的展开状态与selected状态

#### Scenario: Delete a selected node only after explicit confirmation
- **WHEN** the user请求deletecurrentselected的文件或directory
- **THEN** The system MUST 先显示明确的二次确认
- **AND** directorydelete确认 MUST 明确prompt会递归delete其内容
- **AND** 只有在the userexplicit确认后，系统才能执行真实delete

#### Scenario: Fall back to the parent scope after deleting the active node
- **WHEN** the userdeletecurrent激活文件，或delete包含current激活文件的directory
- **THEN** The system MUST 清空失效的document编辑状态与文件变更状态
- **AND** file treeselected MUST fallback到被删节点的父directory；若父directory不可用，则fallback到根节点 `/`

#### Scenario: Rename a file tree node by double click
- **WHEN** the user双击一个非根节点的文件或directory
- **THEN** The system MUST 将该节点switch为原位编辑态，并以current节点名称作为初始值
- **AND** the user MUST 能通过 `Enter` 提交改名、`Escape` 取消改名

#### Scenario: Keep the active workspace path in sync after rename
- **WHEN** the userrenamecurrent激活文件，或rename包含current激活文件的父directory
- **THEN** The system MUST 将 `selectedNodePath`、`activePath` 以及活动document路径sync到新路径
- **AND** 后续 `AgentPane` 与工作区上下文resolve MUST 基于rename后的新路径continue工作

### Requirement: Knowledge workspace MUST surface linked top-level directories in the file tree
knowledge workspaceleft-sidefile tree MUST 把根directory下通过 `.agent.json` 的 `linkDir` 声明得到的mountdirectory，呈现为top-leveldirectory节点。该节点 MUST 仍然使用mount后的虚拟路径作为 UI 路径语义，而不是把底层真实directory的物理路径直接expose给the user。

#### Scenario: Show a linked directory as a top-level tree entry
- **WHEN** 根directory下某个空directory声明了 `linkDir`
- **THEN** file tree MUST 在top-level显示该directory节点
- **AND** 该节点下的内容 MUST 与mount目标directory一致

#### Scenario: Keep mounted directory paths virtual in the file tree
- **WHEN** the user在file tree中查看或选择mountdirectory下的文件
- **THEN** The system MUST 使用mount后的虚拟路径作为节点路径
- **AND** file tree MUST NOT expose真实directory的物理路径

### Requirement: Knowledge workspace MUST route node operations through mounted directory aliases
knowledge workspace对file tree节点执行的新建、delete、rename和刷新等操作 MUST continue通过统一的 `IContextProvider` 契约执行。对于mountdirectory，UI 层 MUST 只使用虚拟路径发起操作，由上下文provide器负责把这些操作映射到真实目标directory；对mount根节点本身的rename或delete MUST 只影响别名入口，不得直接改动真实目标directory的名称或位置。

#### Scenario: Create a node under a mounted directory
- **WHEN** the user在mountdirectory下新建文件或directory
- **THEN** UI MUST 仍然把mount后的虚拟路径传给上下文provide器
- **AND** 最终create MUST 落到真实目标directory中

#### Scenario: Rename or delete the mounted root only changes the alias entry
- **WHEN** the userrename或deletemount根节点
- **THEN** The system MUST 只处理工作区中的别名directory入口
- **AND** 真实目标directory MUST keep不变

### Requirement: Knowledge workspace MUST mark agent owner directories in the file tree
knowledge workspaceleft-sidefile tree MUST 基于节点的 `isAgentOwner` 元数据为directory显示 Agent 标识图标，以帮助the user识别哪些directory直接拥有 `.agent.json`。该标识 MUST 只反映directory是否直接拥有 Agent，不得把only继承父directory Agent 的普通directory标记为 owner。

#### Scenario: Show an agent indicator for owner directories
- **WHEN** file treerender一个directory节点且该节点的 `isAgentOwner` 为 `true`
- **THEN** The system MUST 在该directory节点上显示 Agent 标识图标

### Requirement: Knowledge workspace MUST provide a workspace-owned node navigation bridge with panel restoration
The knowledge workspace MUST provide a higher-level navigation bridge that can reopen a workspace node together with workspace-owned panel restoration state. This bridge MUST own route restoration to the knowledge workspace and MUST support optional task-related `tab` and `detailKey` payloads without giving route-switching semantics to the lower-level document workspace store.

#### Scenario: Reopen a workspace node with task panel restoration
- **WHEN** a caller requests knowledge-workspace navigation for a target workspace path together with task-related `tab` and `detailKey`
- **THEN** the system MUST restore the knowledge-workspace route before opening that node
- **AND** it MUST make the requested `tab` and `detailKey` available to the destination workspace state

#### Scenario: Keep lower-level node opening free of route-switching semantics
- **WHEN** the document workspace store opens a node internally
- **THEN** that lower-level node-opening operation MUST continue to work without owning route switching
- **AND** the higher-level knowledge-workspace navigation bridge MUST remain responsible for route restoration

### Requirement: Knowledge workspace MUST persist and restore the latest workspace node selection across reload
The knowledge workspace MUST persist the latest effective workspace selection while the user navigates the file tree, and MUST restore that selection after a renderer refresh or app restart. The persisted snapshot MUST preserve both the selected tree node and the active document path so directory scope and open-document state can be recovered together. When the exact saved path no longer exists, restoration MUST fall back through the existing workspace path-resolution rules instead of failing.

#### Scenario: Restore the latest selected document after reload
- **WHEN** the user last selected a document node in the knowledge workspace and the renderer reloads
- **THEN** the system MUST reopen that document as the active workspace node
- **AND** it MUST restore the corresponding tree selection state

#### Scenario: Restore a directory-scoped selection after reload
- **WHEN** the user last selected a directory-scoped workspace context and no document was active
- **THEN** the system MUST restore that directory selection after reload
- **AND** it MUST NOT require a stale document path to exist

#### Scenario: Fall back safely when the saved path is stale
- **WHEN** the persisted workspace selection references a path that no longer exists
- **THEN** the system MUST resolve the nearest existing workspace path using the normal restore fallback behavior
- **AND** it MUST NOT fail the workspace mount because of the stale snapshot

#### Scenario: Keep the agent owner indicator always visible
- **WHEN** file treerender一个directory节点且该节点的 `isAgentOwner` 为 `true`
- **THEN** 该图标 MUST 与directory名称一起visible，而不是依赖额外 hover 才出现

#### Scenario: Do not show an agent indicator for inherited directories
- **WHEN** file treerender一个directory节点且该节点的 `isAgentOwner` 不为 `true`
- **THEN** The system MUST NOT 显示 Agent owner 标识图标
- **AND** 即使该节点的 `agentKey` 指向某个继承生效的 Agent，系统也 MUST NOT 将其误标为 owner

### Requirement: Knowledge workspace MUST mount the agent view inside the three-pane layout
knowledge workspace MUST 在现有三栏布局中mount独立的 `AgentView` capability，而不是把directory级 Agent 资产展示塞进right-side `AgentPane`。当currentselecteddirectory节点为 owner 时，main middle panel MUST 显示 `AgentView`，同时right-side `AgentPane` MUST continue保留。

#### Scenario: Show agent view in the middle pane for an owner directory
- **WHEN** the user在knowledge workspaceselected一个 `isAgentOwner === true` 的directory节点
- **THEN** main middle panel MUST render `AgentView`
- **AND** right-side `AgentPane` MUST continue显示并使用current节点的 `agentKey`

#### Scenario: Keep the file tree and agent pane while agent view is active
- **WHEN** `AgentView` 处于显示状态
- **THEN** left-sidefile tree MUST continuekeep可用
- **AND** right-side `AgentPane` MUST NOT 因main middle panelswitch而被卸载为其他内容

### Requirement: Knowledge workspace Markdown viewer SHALL provide viewer and edit modes
The knowledge workspace main Markdown document viewer SHALL provide a user-visible `viewer` / `edit` mode switch for `text/markdown` documents. The viewer SHALL default to `viewer` mode when opening a Markdown document, and mode switching MUST preserve the current Markdown content, save behavior, and editable document workflow.

#### Scenario: Open a Markdown document in viewer mode by default
- **WHEN** a user opens a `text/markdown` document in the knowledge workspace main pane
- **THEN** the system MUST render the document with the Markdown viewer mode set to `viewer`
- **AND** the mode switch MUST be visible in the main Markdown viewer header

#### Scenario: Switch modes without losing edits
- **WHEN** a user edits Markdown content and switches between `viewer` and `edit`
- **THEN** the system MUST preserve the latest editor Markdown content
- **AND** the save action MUST continue saving the same document content after the switch

#### Scenario: Keep non-Markdown text documents out of Markdown preview controls
- **WHEN** the active text viewer document has `mimeType` other than `text/markdown`
- **THEN** the system MUST NOT require Mermaid or Markdown image preview controls to be shown for that document

### Requirement: Knowledge workspace Markdown viewer SHALL support collapsing heading sections in viewer mode
In `viewer` mode the knowledge workspace Markdown viewer SHALL render a fold toggle control before every heading so the user can collapse or expand the section that heading introduces. Collapsing a heading MUST hide the blocks that follow it up to the next heading of the same or higher level, including nested lower-level headings and their content. The collapsed state is session-only in-memory viewer state scoped to the current editor instance; it MUST NOT modify the Markdown document content and is NOT persisted across document switches or reloads. Folding controls SHALL apply only in `viewer` mode, not in raw-source `edit` mode.

#### Scenario: Collapse a heading section
- **WHEN** the user activates the fold toggle of a heading in `viewer` mode
- **THEN** the system MUST hide the following blocks up to the next same-or-higher-level heading, including nested headings and their content
- **AND** the toggle MUST indicate the collapsed state and the underlying Markdown content MUST remain unchanged

#### Scenario: Expand a previously collapsed heading section
- **WHEN** the user activates the fold toggle of a collapsed heading
- **THEN** the system MUST restore visibility of that heading's hidden section

#### Scenario: Folding state is not persisted
- **WHEN** the user collapses one or more headings and then switches documents or reloads the viewer
- **THEN** the reopened document MUST render with all headings expanded

### Requirement: Knowledge workspace Markdown viewer SHALL provide a toolbar control to collapse or expand all headings at once
When the Markdown viewer is in `viewer` mode, the document editor toolbar SHALL expose a single toggle control that collapses every heading in the document, or expands every heading, without requiring the user to activate each heading's individual fold toggle. The control MUST reflect which action it will perform next and MUST NOT be shown in raw-source `edit` mode.

#### Scenario: Collapse every heading from the toolbar
- **WHEN** the user activates the toolbar fold-all control while no heading is collapsed
- **THEN** the system MUST collapse every heading in the document, including nested headings, per the same fold rules as an individual toggle
- **AND** the control MUST subsequently indicate that activating it again will expand all headings

#### Scenario: Expand every heading from the toolbar
- **WHEN** the user activates the toolbar fold-all control while at least one heading is collapsed
- **THEN** the system MUST expand every heading in the document
- **AND** the control MUST subsequently indicate that activating it again will collapse all headings

#### Scenario: Fold-all control is unavailable outside viewer mode
- **WHEN** the Markdown editor is in raw-source `edit` mode
- **THEN** the toolbar MUST NOT show the fold-all control

### Requirement: Knowledge workspace Markdown viewer SHALL render Mermaid diagrams in viewer mode
The knowledge workspace main Markdown viewer SHALL render fenced code blocks whose language is `mermaid` as diagrams in `viewer` mode by using the official `mermaid` package. In `edit` mode, those same blocks MUST remain visible as editable source text.

#### Scenario: Render a Mermaid code block as a diagram in viewer mode
- **WHEN** a `text/markdown` document contains a fenced code block marked as `mermaid`
- **AND** the Markdown viewer mode is `viewer`
- **THEN** the system MUST display a rendered Mermaid diagram for that block
- **AND** the normal Markdown editing workflow MUST remain available for other document content

#### Scenario: Show Mermaid source in edit mode
- **WHEN** a `text/markdown` document contains a fenced code block marked as `mermaid`
- **AND** the Markdown viewer mode is `edit`
- **THEN** the system MUST display the Mermaid block as editable source text

#### Scenario: Contain Mermaid render failures
- **WHEN** Mermaid rendering fails because the diagram source is invalid or rendering throws an exception
- **THEN** the system MUST keep the document viewer mounted and usable
- **AND** the system MUST show a bounded preview error or fall back to source/empty preview for that block without crashing the workspace pane

### Requirement: Knowledge workspace Markdown viewer SHALL render existing Markdown image links
The knowledge workspace main Markdown viewer SHALL display existing Markdown image links as images in `viewer` mode. Supported image sources MUST include remote URLs, `data:image/...` URLs, and local relative paths resolved from the active Markdown document directory.

#### Scenario: Render remote Markdown image links
- **WHEN** a `text/markdown` document contains a Markdown image link whose source is an `http:` or `https:` URL
- **AND** the Markdown viewer mode is `viewer`
- **THEN** the system MUST display the linked image in the document body

#### Scenario: Render data URL Markdown image links
- **WHEN** a `text/markdown` document contains a Markdown image link whose source starts with `data:image/`
- **AND** the Markdown viewer mode is `viewer`
- **THEN** the system MUST display the embedded image in the document body

#### Scenario: Resolve relative Markdown image links from the active document directory
- **WHEN** a `text/markdown` document at `/notes/guide.md` contains a Markdown image link such as `![diagram](./images/flow.png)`
- **AND** the Markdown viewer mode is `viewer`
- **THEN** the system MUST resolve the image path relative to `/notes/`
- **AND** the system MUST use the workspace document loading path or host-compatible URL path to display the image without exposing unrelated local filesystem paths

#### Scenario: Avoid adding image asset management features
- **WHEN** a user views or edits a Markdown document with image links
- **THEN** the system MUST NOT require new upload, paste-to-file, drag-and-drop import, or standalone image asset management behavior for this change

### Requirement: Knowledge workspace Markdown viewer SHALL render wiki-style PDF embeds as inline previews
The knowledge workspace main Markdown viewer SHALL display wiki-style PDF embeds (`![[file.pdf]]`) and standard Markdown image syntax pointing to `.pdf` files as inline `<iframe>` PDF previews in the document body in `viewer` mode, matching the Obsidian embed experience. The PDF source MUST be resolved through the same document-relative path resolution used for other assets.

#### Scenario: Render a wiki-style PDF embed as an inline iframe in viewer mode
- **WHEN** a `text/markdown` document contains a wiki-style embed `![[file.pdf]]`
- **AND** the Markdown viewer mode is `viewer`
- **THEN** the system MUST render an `<iframe>` in the document body at the position of the embed
- **AND** the iframe `src` MUST resolve to the correct `document-asset` URL for the PDF file

#### Scenario: Render standard Markdown image syntax pointing to a PDF as an inline iframe
- **WHEN** a `text/markdown` document contains `![alt](path/to/file.pdf)`
- **AND** the Markdown viewer mode is `viewer`
- **THEN** the system MUST render an `<iframe>` in the document body rather than a broken image or plain link

#### Scenario: PDF embed does not appear in edit mode
- **WHEN** a `text/markdown` document contains a wiki-style PDF embed or a Markdown image link pointing to a `.pdf` file
- **AND** the Markdown viewer mode is `edit`
- **THEN** the system MUST NOT inject inline PDF iframes; the source text remains editable as-is

#### Scenario: PDF embed survives external content sync
- **WHEN** an inline PDF embed has been injected into the document body
- **AND** external content sync causes ProseMirror to reconcile the DOM
- **THEN** the system MUST re-inject the PDF embed so it remains visible to the user

### Requirement: Knowledge workspace Markdown viewer SHALL route Markdown document links to workspace navigation
The knowledge workspace main Markdown viewer SHALL treat links to other Markdown documents as in-workspace navigation targets. When a user clicks a relative or resolved link to a `.md` or `.markdown` document, the system MUST open that target as the active node in the workspace and preserve node history so back/forward navigation returns to the previous selection. Non-Markdown links MUST keep their existing behavior.

#### Scenario: Open a linked Markdown document from the main viewer
- **WHEN** a `text/markdown` document in viewer mode contains a link to another `.md` or `.markdown` file
- **AND** the user clicks that link
- **THEN** the system MUST open the linked document as the active workspace node
- **AND** the system MUST record the previous selection in node history

#### Scenario: Keep non-Markdown links on their existing path
- **WHEN** a `text/markdown` document in viewer mode contains a link that does not resolve to a Markdown document
- **THEN** the system MUST keep the existing non-navigation behavior for that link type

### Requirement: Knowledge workspace Markdown viewer SHALL preserve existing viewer boundaries
The Mermaid and image preview behavior SHALL apply only to the main knowledge workspace Markdown document viewer. Chat-message Markdown rendering, PDF viewing, unsupported viewer handling, diff display, undo/redo, and document registry resolution MUST keep their existing responsibilities.

#### Scenario: Leave chat message Markdown rendering unchanged
- **WHEN** a chat message is rendered through the chat Markdown renderer
- **THEN** this change MUST NOT require the chat message renderer to use the main document viewer Mermaid or image preview implementation

#### Scenario: Preserve PDF and unsupported document behavior
- **WHEN** the active document is a PDF or an unsupported MIME type
- **THEN** the system MUST keep using the existing PDF viewer or unsupported viewer state
- **AND** the Markdown viewer mode switch MUST NOT replace those viewer paths

#### Scenario: Preserve file change diff and undo redo controls
- **WHEN** a Markdown document has a latest file change record
- **AND** the user switches between `viewer` and `edit`
- **THEN** the system MUST keep the file change diff and undo/redo controls governed by the existing document pane behavior

### Requirement: Knowledge workspace MUST merge an eligible agent conversation into the active Q/A document
The knowledge workspace MUST support archiving the full visible message history of the current eligible agent conversation into the active writable Markdown document. The archive operation MUST treat the document as a single Q/A file, merge user messages into the `Q` section, merge assistant messages into the `A` section, and keep only the latest effective content when older paragraphs are superseded.

#### Scenario: Archive the full visible conversation into the active document
- **WHEN** the user triggers archive for an eligible agent conversation bound to the active writable Markdown document
- **THEN** the system MUST use the full visible conversation as the archive input
- **AND** the system MUST merge user messages only into `Q`
- **AND** the system MUST merge assistant messages only into `A`

#### Scenario: Ignore deleted messages during archive
- **WHEN** the current conversation contains soft-deleted messages
- **THEN** the system MUST exclude those deleted messages from the archive input

### Requirement: Knowledge workspace MUST show lightweight archive progress inside the chat thread
When the user triggers archive from an eligible agent conversation, the knowledge workspace MUST immediately show lightweight archive progress inside the current chat thread using the existing functional-parts/tool-call presentation, so the user can see that the archive is running before the final result arrives.

#### Scenario: Show an in-thread archive tool call while archiving
- **WHEN** the user clicks archive in an eligible agent conversation
- **THEN** the system MUST immediately show a lightweight archive progress event in the current chat thread
- **AND** that progress event MUST use the chat functional-parts/tool-call presentation rather than only a toolbar-level status

#### Scenario: Replace archive progress with the final archive result
- **WHEN** the archive operation succeeds, produces no change, or fails
- **THEN** the system MUST replace or update the in-thread archive progress event with a final tool-result style event
- **AND** the system MUST NOT persist that temporary archive progress event as a normal conversation message

### Requirement: Knowledge workspace MUST split Q and A by the first triple-asterisk markdown divider
The knowledge workspace archive flow MUST identify the top-level `Q` / `A` boundary using only the first `***` Markdown horizontal divider in the active document. If the document does not contain such a divider, the system MUST append `***` at the end of the document before producing the merged result. `---` MUST NOT be treated as the archive divider.

#### Scenario: Split Q and A by the first valid divider
- **WHEN** the active Markdown document contains one or more valid `***` dividers
- **THEN** the system MUST use only the first such divider as the top-level `Q` / `A` boundary
- **AND** later dividers MUST remain part of normal document content

#### Scenario: Insert divider when the document has no archive boundary
- **WHEN** the active Markdown document does not contain a valid archive divider
- **THEN** the system MUST append `***` to establish the `Q` / `A` boundary before merging archived content

#### Scenario: Ignore triple-dash divider for archive boundary detection
- **WHEN** the active Markdown document contains `---` but no valid `***` archive divider
- **THEN** the system MUST NOT treat `---` as the archive boundary
- **AND** the system MUST still append `***` before merging archived content

### Requirement: Knowledge workspace MUST preserve diff and undo semantics for archive writes
Archive writes in the knowledge workspace MUST flow through the existing file change history pipeline rather than bypassing it with a direct document overwrite. The merged result MUST become a normal workspace file change so the user can inspect the diff and use undo/redo to revert or restore the archive result.

#### Scenario: Archive write appears as a normal file change
- **WHEN** an archive operation produces a changed document
- **THEN** the system MUST record the archive result through the workspace file change service
- **AND** the latest file change diff MUST reflect the archive result

#### Scenario: Undo and redo an archive result
- **WHEN** the user triggers undo or redo after a successful archive write
- **THEN** the system MUST restore the pre-archive or post-archive document content through the existing workspace undo/redo flow

#### Scenario: Skip write when archive produces no new content
- **WHEN** an archive operation produces a merged document that is identical to the current active document
- **THEN** the system MUST NOT write the document
- **AND** the system MUST report that no new content was archived

### Requirement: Knowledge workspace MUST persist archive state on the local conversation
When an eligible archive succeeds, the knowledge workspace MUST persist archive metadata on the current local conversation so the archive state survives reload and conversation re-selection.

#### Scenario: Persist archive metadata after a successful archive
- **WHEN** an archive operation successfully writes a changed or unchanged merged result for the current local conversation
- **THEN** the system MUST persist archive metadata on that conversation
- **AND** the metadata MUST include at least the archived document path and a snapshot marker that can detect later conversation growth

#### Scenario: Mark a conversation stale after new turns are added
- **WHEN** a conversation has persisted archive metadata and later receives additional visible messages
- **THEN** the system MUST mark the conversation archive state as stale
- **AND** the previously persisted archive metadata MUST remain available for UI display

### Requirement: Knowledge workspace MUST expose viewer-level search interface and implement Markdown search
The knowledge workspace MUST expose search through a viewer-level interface so future document viewers can implement scoped search. In this change, only the Markdown viewer MUST implement in-document keyword search. When the active viewer supports search, search MUST open with `Ctrl+F` or `Cmd+F`, MUST highlight matches inside the active viewer, and MUST support previous/next match navigation.

#### Scenario: Open Markdown document search with shortcut
- **WHEN** a Markdown document is active and the user presses `Ctrl+F` or `Cmd+F`
- **THEN** the system MUST open the Markdown search control in the document pane
- **AND** the system MUST scope that search behavior to the currently active Markdown document

#### Scenario: Highlight and navigate matches
- **WHEN** the user enters a non-empty search term and the current Markdown document has matches
- **THEN** the system MUST highlight matches in the viewer
- **AND** the user MUST be able to move to the previous and next match

#### Scenario: Preserve browser search behavior for non-Markdown documents
- **WHEN** the current active viewer does not implement the viewer search interface
- **THEN** the system MUST NOT intercept the browser find shortcut for document viewer search

#### Scenario: Future viewers can implement search through the same interface
- **WHEN** a future non-Markdown viewer implements the viewer search interface
- **THEN** the document pane MUST drive search-term updates, match-count reads, and previous/next navigation through that interface
- **AND** the future viewer MUST own its highlighting and scrolling behavior

### Requirement: Knowledge workspace save button MUST reflect active-document dirty state
The knowledge workspace document save button MUST use the active document's canonical dirty state and distinguish clean, dirty, and saving visual states for writable text files.

#### Scenario: Show dirty save state
- **WHEN** the current writable text document has unsaved local changes
- **THEN** the save button MUST render a dirty visual state
- **AND** its accessible label or tooltip MUST indicate that unsaved changes exist

#### Scenario: Show saving state
- **WHEN** the active document save operation is running
- **THEN** the save button MUST render with a saving visual state
- **AND** the button MUST remain disabled until the save operation completes

### Requirement: Knowledge workspace MUST show Agent folder index document when present
When an Agent owner directory is selected, the knowledge workspace MUST open an existing `index.md` in that directory as the main document while preserving the selected directory as the active Agent scope. The system MUST NOT create `index.md` automatically.

#### Scenario: Show index document for Agent owner directory
- **WHEN** the user selects an Agent owner directory that contains `index.md`
- **THEN** the system MUST open that `index.md` in the main document pane
- **AND** the active Agent context MUST continue to resolve from the selected directory

#### Scenario: Keep Agent view when index document is absent
- **WHEN** the user selects an Agent owner directory that does not contain `index.md`
- **THEN** the system MUST keep showing `AgentView` in the main pane
- **AND** the system MUST NOT create a new `index.md`

### Requirement: Knowledge workspace MUST serve as the file-resolution source for `@filename`
The knowledge workspace MUST allow the chat send pipeline to resolve `@filename` references against the effective Agent context for the conversation. If the conversation is bound to an Agent, resolution MUST use that Agent scope; otherwise it MUST use the default active Agent scope. Resolution MUST prefer exact basename matches; when basename alone is ambiguous within that Agent scope, the system MAY accept a unique path-suffix match. Only documents that can be safely read as text MAY be injected as prompt sections.

#### Scenario: Resolve a unique basename from the effective Agent context
- **WHEN** chat input contains `@guide.md` and the current Agent context contains exactly one file with that basename
- **THEN** the system MUST resolve the reference to that unique file

#### Scenario: Allow unique path-suffix resolution when basenames collide
- **WHEN** multiple files inside the current Agent context share the same basename and the user's reference uniquely matches one path suffix
- **THEN** the system MUST resolve the reference to that unique path

#### Scenario: Do not inject non-text files as prompt sections
- **WHEN** an `@filename` reference resolves to a non-text document
- **THEN** the system MUST block that prompt-section injection
- **AND** the system MUST return a clear error instead of appending binary content to the prompt

### Requirement: Knowledge workspace agent conversation list MUST rename the selected local conversation from the list toolbar
When the knowledge workspace agent conversation surface is showing the conversation list, the rename entry MUST be exposed from the list toolbar instead of the detail header. Triggering that action MUST put only the currently selected local conversation row into inline editing inside the list.

#### Scenario: Show rename only from the list toolbar
- **WHEN** the right-side agent conversation surface is showing detail mode for the current conversation
- **THEN** the system MUST NOT show a rename button in the detail header
- **AND** switching back to the conversation list MUST restore the list-toolbar rename entry for eligible local conversations

#### Scenario: Inline-edit only the selected local conversation row
- **WHEN** the user activates rename from the list toolbar while a local conversation is selected
- **THEN** the system MUST put only that selected conversation row into inline edit mode inside the list
- **AND** the detail title area MUST remain non-editable
- **AND** the system MUST NOT put any non-selected row into rename mode

#### Scenario: Do not expose agent-list rename for ineligible conversations
- **WHEN** the currently selected conversation is missing or is not a locally persisted conversation
- **THEN** the system MUST NOT expose the list-toolbar rename action
- **AND** the system MUST NOT enter inline rename mode for that row

### Requirement: Knowledge workspace MUST expose a document import entry alongside document creation
The knowledge workspace document tree MUST expose a document import entry next to the existing new-document entry so users can start a plugin-driven import flow from their current workspace context.

#### Scenario: Open the import wizard from the document tree
- **WHEN** the user clicks the document import entry in the document tree toolbar
- **THEN** the workspace MUST open the document import wizard
- **AND** the wizard MUST default its target directory to the currently selected directory when one is available

#### Scenario: Change the target directory before import
- **WHEN** the user is configuring an import in the wizard
- **THEN** the workspace MUST allow the user to change the target directory before execution
- **AND** the selected target directory MUST be passed into the invoked import contribution

### Requirement: Knowledge workspace MUST organize transcript and summary outputs according to import result shape
When a document import produces transcript content only, the workspace MUST create a normal Markdown document in the selected target directory. When a document import produces both transcript and summary content, the workspace MUST treat the summary as the primary document and MUST place the transcript under the primary document's `references/` directory as a referenced resource.

#### Scenario: Persist transcript-only output as a normal document
- **WHEN** a completed import returns transcript content without summary content
- **THEN** the workspace MUST create the transcript as a normal Markdown document in the selected target directory
- **AND** the created transcript document MUST be opened as the primary document after success

#### Scenario: Persist transcript-plus-summary output with transcript as a reference resource
- **WHEN** a completed import returns both transcript and summary content
- **THEN** the workspace MUST create the summary document in the selected target directory
- **AND** the workspace MUST create the transcript under that summary document's `references/` directory as a referenced resource
- **AND** the summary document MUST link to the transcript resource

### Requirement: Knowledge workspace MUST keep failed imports from leaving user-visible success state
When an import fails before completion, the knowledge workspace MUST keep the wizard in a failed state, surface an error to the user, and MUST NOT present the import as successful.

#### Scenario: Report transcript-fetch failure without success navigation
- **WHEN** a Bilibili import fails while fetching transcript data
- **THEN** the workspace MUST surface an error message for the failed import
- **AND** the workspace MUST NOT close the wizard as a success case or open a primary document

#### Scenario: Report summary-generation failure without partial-success messaging
- **WHEN** a summary-enabled import fails while generating summary content
- **THEN** the workspace MUST surface an error message for the failed stage
- **AND** the workspace MUST NOT present a success toast for the import
