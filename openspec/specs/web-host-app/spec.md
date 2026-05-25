English | [Chinese](spec.zh-CN.md)

## Purpose
Define web host runtime composition for sync-backed chat, knowledge workspace access, and top-level workspace switching.

## Requirements
### Requirement: Web host MUST initialize shared stores with sync storage provider
Web host MUST 在启动时使用 `SyncStorageProvider` 作为聊天history存储实现，通过设置中的 `syncKey` 决定远端sync命名空间，并把 provider runtime、共享聊天状态和 `conversation-workspace` 所需的主题/依赖一并装配到页面入口。 #### Scenario: Web host bootstraps sync storage on page load
- **WHEN** Web host完成启动并初始化聊天 store
- **THEN** host MUST 为共享聊天view注入 `SyncStorageProvider`
- **AND** 该 provider MUST 使用current设置中的 `syncKey` 初始化sync上下文 #### Scenario: Web host rejects development syncKey outside development
- **WHEN** Web host运行于非开发环境且current `syncKey` 为 `0`
- **THEN** host MUST 阻止sync初始化
- **AND** host MUST 显示the uservisible的configurationprompt #### Scenario: Web host pushes pre-existing local unsynced conversations on every startup
- **WHEN** Web host启动时local IndexedDB 中已经存在普通聊天conversation或已导入external history，但这些记录尚未被sync到服务端
- **THEN** host MUST 通过 `SyncStorageProvider.hydrate()` 触发启动补偿
- **AND** 这些local旧记录 MUST 在该次启动的sync完成后entercurrent `syncKey` 对应的远端命名空间 ## ADDED Requirements ### Requirement: Web host MUST compose conversation workspace with provider runtime
Web host MUST 在页面入口装配共享 `conversation-workspace`，并为其provide可用 provider、modeldirectoryresolve器与多模态conversationrecoverycapability。 #### Scenario: Mount workspace with runtime dependencies
- **WHEN** Web host完成 provider runtime 初始化
- **THEN** host MUST 将 provider resolve器、modeldirectoryresolve器和聊天存储实现注入共享工作区
- **AND** 工作区 MUST 能recovery包含attachment和注解的localconversation ### Requirement: Web host MUST hide history source switch in sidebar
Web host MUST 在共享侧边栏中default隐藏“聊天/导入”来源switch，only保留单一history流入口，避免与 Web 端主workflow冲突。 #### Scenario: Mount workspace with source switch disabled
- **WHEN** Web hostrender `conversation-workspace`
- **THEN** host MUST 以关闭状态传入history来源switchcapability（如 `showHistorySourceSwitch = false`）
- **AND** 侧边栏 MUST 不显示“聊天/导入”switch按钮组 ### Requirement: Web host MUST expose a knowledge workspace entry with a web context provider
Web host MUST provideknowledge workspace入口，并在enter该入口时装配 `DocumentWorkspaceView` 与 Web 侧knowledge file provider。该capability MUST 独立于现有聊天工作区存在，而不是要求直接改造 `conversation-workspace`。 #### Scenario: Mount knowledge workspace in the web host
- **WHEN** Web hostenterknowledge workspace
- **THEN** host MUST render `DocumentWorkspaceView`
- **AND** host MUST 向其注入可用于directory树和document读写的 Web `IContextProvider` ### Requirement: Web host MUST use an HTTP-backed context provider for knowledge access
Web host MUST 在浏览器环境中通过 HTTP-backed `IContextProvider` 访问知识 context 数据，而不是让 browser 端直接承担local文件系统访问职责。该 provider MUST 面向 `/api/context` keep与 `IContextProvider` 一致的语义。 #### Scenario: Initialize browser-side context access through the server endpoint
- **WHEN** Web host首次enterknowledge workspace且尚未获得知识文件访问capability
- **THEN** host MUST 触发 Web 侧knowledge file provider 的访问初始化流程
- **AND** 该初始化 MUST 通过 `/api/context/initialize-access` 对应的远端语义完成
- **AND** 初始化成功后knowledge workspace MUST 能continue执行file treeload和通用 `DocumentViewer` resolve #### Scenario: Access tree and document data through `/api/context`
- **WHEN** Web knowledge workspace请求directory树、documentread、documentwrite、节点create、节点delete或节点rename
- **THEN** Web 侧 `IContextProvider` MUST 通过 `/api/context` 下与 `listTree`、`readDocument`、`writeDocument`、`createNode`、`deleteNode`、`renameNode` 对应的 endpoint 完成请求
- **AND** browser 端 MUST 不直接exposelocal文件系统路径 #### Scenario: Support Markdown, plain text and PDF documents in the web host
- **WHEN** Web host打开 `text/markdown`、`text/plain` 或 `application/pdf` document
- **THEN** host MUST allow `DocumentWorkspaceView` 通过统一的 `readDocument` 契约获取对应document
- **AND** text类型 MUST entertext viewer，PDF MUST enter只读 PDF viewer ### Requirement: Web host MUST provide top-level switching between knowledge and chat workspaces
Web host MUST 在top-levelnavigation中providedefault工作区switch入口，使the user可以在knowledge workspace与聊天工作区之间直接switch，而不必依赖手动修改 URL。该switch MUST keep `/compare` continue作为聊天工作区内部的现有入口，而不是新增为top-level工作区菜单项。 #### Scenario: Switch from knowledge workspace to chat workspace from the top bar
- **WHEN** the user位于 Web host的knowledge workspace并通过top-levelnavigation选择聊天工作区
- **THEN** host MUST switch到 `ConversationWorkspaceView`
- **AND** 现有聊天工作区运行时 MUST continue可用
