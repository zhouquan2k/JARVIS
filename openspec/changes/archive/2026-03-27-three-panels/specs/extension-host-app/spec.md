## ADDED Requirements

### Requirement: Extension host MUST expose a knowledge workspace entry with an extension context provider
扩展宿主 MUST 提供知识工作区入口，并在进入该入口时装配 `KnowledgeWorkspaceView` 与扩展侧知识文件 Provider。该入口 MUST 与现有聊天工作区并存，而不是要求直接改造共享 `conversation-workspace`。

#### Scenario: Mount knowledge workspace in the extension host
- **WHEN** 扩展宿主进入知识工作区
- **THEN** 宿主 MUST 渲染 `KnowledgeWorkspaceView`
- **AND** 宿主 MUST 向其注入扩展侧 `IContextProvider`

### Requirement: Extension host MUST persist knowledge documents through extension-managed storage
扩展宿主 MUST 通过扩展可控的存储或桥接能力持久化知识工作区中的目录树和 Markdown 文档，而不是依赖页面侧不可控的临时内存状态。

#### Scenario: Save a Markdown document in the extension host
- **WHEN** 用户在扩展知识工作区的单栏所见即所得编辑器中保存当前 Markdown 文档
- **THEN** 宿主 MUST 通过扩展侧知识文件 Provider 持久化该文档内容
- **AND** 后续重新打开该文档时 MUST 能恢复已保存的内容

### Requirement: Extension host MUST provide top-level switching between knowledge and chat workspaces
扩展宿主 MUST 在顶层导航中提供默认工作区切换入口，使用户可以在知识工作区与聊天工作区之间直接切换，而不要求通过内部工作流间接跳转。该切换 MUST 保持 `/compare` 继续沿用现有聊天工作区入口。

#### Scenario: Switch between default workspaces in the extension host
- **WHEN** 用户通过扩展宿主顶层导航在知识工作区与聊天工作区之间切换
- **THEN** 宿主 MUST 在 `KnowledgeWorkspaceView` 与 `ConversationWorkspaceView` 之间切换
- **AND** 知识文档存储与聊天工作区运行时 MUST 继续分别由各自宿主能力承载
