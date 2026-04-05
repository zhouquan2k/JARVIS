## MODIFIED Requirements

### Requirement: Desktop host MUST expose a knowledge workspace entry with a desktop context provider
桌面宿主 MUST 提供知识工作区入口，并在进入该入口时装配 `DocumentWorkspaceView` 与桌面侧知识文件 Provider。该入口 MUST 独立于现有聊天工作区存在，以便在不改动 `conversation-workspace` 的前提下提供文件浏览和通用文档查看/编辑能力。

#### Scenario: Mount knowledge workspace in the desktop host
- **WHEN** 桌面宿主进入知识工作区
- **THEN** 宿主 MUST 渲染 `DocumentWorkspaceView`
- **AND** 宿主 MUST 向其注入桌面侧 `IContextProvider`

### Requirement: Desktop host MUST provide a desktop-managed knowledge context provider
桌面宿主 MUST 通过桌面侧可控能力为知识工作区注入 `IContextProvider`，而 renderer MUST 仅通过该 provider 访问目录树和文档读写接口。该要求 MUST 保持与共享知识工作区契约一致，而不要求 renderer 理解任何底层存储细节。

#### Scenario: Read write and manage nodes through the desktop context provider
- **WHEN** 知识工作区在 renderer 中请求目录树读取、文档读取、文档写入、节点创建、节点删除或节点重命名
- **THEN** renderer MUST 通过桌面侧 `IContextProvider` 发起请求
- **AND** 底层存储实现 MUST 继续由桌面宿主受控承载

#### Scenario: Open MIME-aware documents in the desktop host
- **WHEN** 桌面宿主打开 `text/markdown`、`text/plain` 或 `application/pdf` 文档
- **THEN** 桌面侧 `IContextProvider.readDocument()` MUST 返回包含 `mimeType` 与 `dataBase64` 的统一载荷
- **AND** `DocumentWorkspaceView` MUST 根据 MIME 解析对应 viewer，而不是按扩展名分支

### Requirement: Desktop host MUST provide top-level switching between knowledge and chat workspaces
桌面宿主 MUST 在顶层导航中提供默认工作区切换入口，使用户可以在知识工作区与聊天工作区之间直接切换。该切换 MUST 与现有桌面聊天运行时兼容，且 MUST NOT 把 `/compare` 提升为新的顶层工作区菜单项。

#### Scenario: Switch from chat workspace back to knowledge workspace from the top bar
- **WHEN** 用户位于桌面宿主的聊天工作区并通过顶层导航选择知识工作区
- **THEN** 宿主 MUST 切换到 `DocumentWorkspaceView`
- **AND** 桌面侧知识文件 Provider MUST 继续作为该视图的文档访问入口
