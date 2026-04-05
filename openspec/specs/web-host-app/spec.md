## MODIFIED Requirements

### Requirement: Web host MUST initialize shared stores with sync storage provider
Web 宿主 MUST 在启动时使用 `SyncStorageProvider` 作为聊天历史存储实现，通过设置中的 `syncKey` 决定远端同步命名空间，并把 provider runtime、共享聊天状态和 `conversation-workspace` 所需的主题/依赖一并装配到页面入口。

#### Scenario: Web host bootstraps sync storage on page load
- **WHEN** Web 宿主完成启动并初始化聊天 store
- **THEN** 宿主 MUST 为共享聊天视图注入 `SyncStorageProvider`
- **AND** 该 provider MUST 使用当前设置中的 `syncKey` 初始化同步上下文

#### Scenario: Web host rejects development syncKey outside development
- **WHEN** Web 宿主运行于非开发环境且当前 `syncKey` 为 `0`
- **THEN** 宿主 MUST 阻止同步初始化
- **AND** 宿主 MUST 显示用户可见的配置提示

#### Scenario: Web host pushes pre-existing local unsynced conversations on every startup
- **WHEN** Web 宿主启动时本地 IndexedDB 中已经存在普通聊天会话或已导入外部历史，但这些记录尚未被同步到服务端
- **THEN** 宿主 MUST 通过 `SyncStorageProvider.hydrate()` 触发启动补偿
- **AND** 这些本地旧记录 MUST 在该次启动的同步完成后进入当前 `syncKey` 对应的远端命名空间

## ADDED Requirements

### Requirement: Web host MUST compose conversation workspace with provider runtime
Web 宿主 MUST 在页面入口装配共享 `conversation-workspace`，并为其提供可用 provider、模型目录解析器与多模态会话恢复能力。

#### Scenario: Mount workspace with runtime dependencies
- **WHEN** Web 宿主完成 provider runtime 初始化
- **THEN** 宿主 MUST 将 provider 解析器、模型目录解析器和聊天存储实现注入共享工作区
- **AND** 工作区 MUST 能恢复包含附件和注解的本地会话

### Requirement: Web host MUST hide history source switch in sidebar
Web 宿主 MUST 在共享侧边栏中默认隐藏“聊天/导入”来源切换，仅保留单一历史流入口，避免与 Web 端主工作流冲突。

#### Scenario: Mount workspace with source switch disabled
- **WHEN** Web 宿主渲染 `conversation-workspace`
- **THEN** 宿主 MUST 以关闭状态传入历史来源切换能力（如 `showHistorySourceSwitch = false`）
- **AND** 侧边栏 MUST 不显示“聊天/导入”切换按钮组

### Requirement: Web host MUST expose a knowledge workspace entry with a web context provider
Web 宿主 MUST 提供知识工作区入口，并在进入该入口时装配 `DocumentWorkspaceView` 与 Web 侧知识文件 Provider。该能力 MUST 独立于现有聊天工作区存在，而不是要求直接改造 `conversation-workspace`。

#### Scenario: Mount knowledge workspace in the web host
- **WHEN** Web 宿主进入知识工作区
- **THEN** 宿主 MUST 渲染 `DocumentWorkspaceView`
- **AND** 宿主 MUST 向其注入可用于目录树和文档读写的 Web `IContextProvider`

### Requirement: Web host MUST use an HTTP-backed context provider for knowledge access
Web 宿主 MUST 在浏览器环境中通过 HTTP-backed `IContextProvider` 访问知识 context 数据，而不是让 browser 端直接承担本地文件系统访问职责。该 provider MUST 面向 `/api/context` 保持与 `IContextProvider` 一致的语义。

#### Scenario: Initialize browser-side context access through the server endpoint
- **WHEN** Web 宿主首次进入知识工作区且尚未获得知识文件访问能力
- **THEN** 宿主 MUST 触发 Web 侧知识文件 Provider 的访问初始化流程
- **AND** 该初始化 MUST 通过 `/api/context/initialize-access` 对应的远端语义完成
- **AND** 初始化成功后知识工作区 MUST 能继续执行文件树加载和通用 `DocumentViewer` 解析

#### Scenario: Access tree and document data through `/api/context`
- **WHEN** Web 知识工作区请求目录树、文档读取、文档写入、节点创建、节点删除或节点重命名
- **THEN** Web 侧 `IContextProvider` MUST 通过 `/api/context` 下与 `listTree`、`readDocument`、`writeDocument`、`createNode`、`deleteNode`、`renameNode` 对应的 endpoint 完成请求
- **AND** browser 端 MUST 不直接暴露本地文件系统路径

#### Scenario: Support Markdown, plain text and PDF documents in the web host
- **WHEN** Web 宿主打开 `text/markdown`、`text/plain` 或 `application/pdf` 文档
- **THEN** 宿主 MUST 允许 `DocumentWorkspaceView` 通过统一的 `readDocument` 契约获取对应文档
- **AND** 文本类型 MUST 进入文本 viewer，PDF MUST 进入只读 PDF viewer

### Requirement: Web host MUST provide top-level switching between knowledge and chat workspaces
Web 宿主 MUST 在顶层导航中提供默认工作区切换入口，使用户可以在知识工作区与聊天工作区之间直接切换，而不必依赖手动修改 URL。该切换 MUST 保持 `/compare` 继续作为聊天工作区内部的现有入口，而不是新增为顶层工作区菜单项。

#### Scenario: Switch from knowledge workspace to chat workspace from the top bar
- **WHEN** 用户位于 Web 宿主的知识工作区并通过顶层导航选择聊天工作区
- **THEN** 宿主 MUST 切换到 `ConversationWorkspaceView`
- **AND** 现有聊天工作区运行时 MUST 继续可用
