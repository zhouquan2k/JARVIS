## ADDED Requirements

### Requirement: Web host MUST expose a knowledge workspace entry with a web context provider
Web 宿主 MUST 提供知识工作区入口，并在进入该入口时装配 `KnowledgeWorkspaceView` 与 Web 侧知识文件 Provider。该能力 MUST 独立于现有聊天工作区存在，而不是要求直接改造 `conversation-workspace`。

#### Scenario: Mount knowledge workspace in the web host
- **WHEN** Web 宿主进入知识工作区
- **THEN** 宿主 MUST 渲染 `KnowledgeWorkspaceView`
- **AND** 宿主 MUST 向其注入可用于目录树和文档读写的 Web `IContextProvider`

### Requirement: Web host MUST use an HTTP-backed context provider for knowledge access
Web 宿主 MUST 在浏览器环境中通过 HTTP-backed `IContextProvider` 访问知识 context 数据，而不是让 browser 端直接承担本地文件系统访问职责。该 provider MUST 面向 `/api/context` 保持与 `IContextProvider` 一致的语义。

#### Scenario: Initialize browser-side context access through the server endpoint
- **WHEN** Web 宿主首次进入知识工作区且尚未获得知识文件访问能力
- **THEN** 宿主 MUST 触发 Web 侧知识文件 Provider 的访问初始化流程
- **AND** 该初始化 MUST 通过 `/api/context/initialize-access` 对应的远端语义完成
- **AND** 初始化成功后知识工作区 MUST 能继续执行文件树加载和单栏所见即所得 Markdown 编辑

#### Scenario: Access tree and document data through `/api/context`
- **WHEN** Web 知识工作区请求目录树、文档读取、文档写入或节点创建
- **THEN** Web 侧 `IContextProvider` MUST 通过 `/api/context` 下与 `listTree`、`readDocument`、`writeDocument`、`createNode` 对应的 endpoint 完成请求
- **AND** browser 端 MUST 不直接暴露本地文件系统路径

### Requirement: Web host MUST provide top-level switching between knowledge and chat workspaces
Web 宿主 MUST 在顶层导航中提供默认工作区切换入口，使用户可以在知识工作区与聊天工作区之间直接切换，而不必依赖手动修改 URL。该切换 MUST 保持 `/compare` 继续作为聊天工作区内部的现有入口，而不是新增为顶层工作区菜单项。

#### Scenario: Switch from knowledge workspace to chat workspace from the top bar
- **WHEN** 用户位于 Web 宿主的知识工作区并通过顶层导航选择聊天工作区
- **THEN** 宿主 MUST 切换到 `ConversationWorkspaceView`
- **AND** 现有聊天工作区运行时 MUST 继续可用
