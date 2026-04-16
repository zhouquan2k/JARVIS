English | [Chinese](spec.zh-CN.md) ## MODIFIED Requirements ### Requirement: Extension host MUST initialize shared stores with proxy runtime
扩展全窗口host MUST 在启动时同时初始化普通聊天、history导入与对比流程所需的 store，并通过 extension runtime 注入可用 Provider、external history provider 注册表与sync存储实现；sync命名空间 MUST 由设置中的 `syncKey` 决定。该 runtime 还 MUST 能support经 Background 代理转发的多模态发送capability，并驱动共享 `conversation-workspace`。 #### Scenario: Host bootstraps runtime and stores on page load
- **WHEN** 扩展全窗口页面完成初始化
- **THEN** host MUST 为 `useChatStore` 注入modelresolve器、external history provider 注册表与 `SyncStorageProvider`
- **AND** host MUST 为 `useCompareStore` 注入可按 `providerId` 获取实例的 runtime，并onlyexpose extension 运行模式可用 Provider #### Scenario: Extension host validates syncKey before enabling sync
- **WHEN** 扩展host初始化synccapability并read到 `syncKey = "0"`
- **THEN** 开发环境 MUST allowcontinue初始化
- **AND** 非开发环境 MUST 阻止sync初始化并promptthe userconfiguration真实 `syncKey` #### Scenario: Extension host pushes pre-existing local unsynced conversations on every startup
- **WHEN** 扩展host启动时local存储中已经存在普通聊天conversation或已导入external history，但这些记录尚未enter远端服务端
- **THEN** host MUST 在初始化 `SyncStorageProvider` 后触发包含补偿语义的 `hydrate()`
- **AND** 该次启动的sync MUST 将这些local旧记录推送到current `syncKey` 对应的远端命名空间 ## ADDED Requirements ### Requirement: Extension host MUST compose conversation workspace with proxy-backed multimodal runtime
扩展host MUST 将共享 `conversation-workspace` 与基于 Background Proxy 的 provider runtime 组合起来，使普通聊天工作区能够发送带attachment的请求并recovery结构化message内容。 #### Scenario: Mount workspace with proxy-backed providers
- **WHEN** 扩展host完成 provider runtime 初始化
- **THEN** host MUST 将基于 proxy 的 provider resolve器、modeldirectoryresolve器和history provider 注入共享工作区
- **AND** 工作区 MUST 能消费来自 Background 的标准化 `text + annotations` update ### Requirement: Extension host MUST expose history source switch in sidebar
扩展host MUST 在共享侧边栏中启用“local / 外部”一级来源switch，并在外部来源下expose `ChatGPT`、`Gemini` 与 `外部文件导入` 的二级入口。 #### Scenario: Mount workspace with source switch enabled
- **WHEN** 扩展hostrender `conversation-workspace`
- **THEN** host MUST 以启用状态传入“local / 外部”来源switchcapability
- **AND** 侧边栏 MUST 在外部来源下显示 `ChatGPT`、`Gemini` 与 `外部文件导入` 入口 ### Requirement: Extension host MUST provision Gemini history runtime dependencies
扩展host MUST 为 Gemini historyprovide者装配remoteconfigurationload器、受控标签页桥接和内容脚本通信capability，使其能够在扩展运行时工作。 #### Scenario: Activate Gemini external history in extension host
- **WHEN** the user在扩展host的外部来源中switch到 `Gemini`
- **THEN** host MUST 能resolve并激活 Gemini history provider
- **AND** 后续historyquery MUST 通过 Background 与 Gemini 页面桥接完成 ### Requirement: Extension host MUST keep compare persistence local-only during phase 7
扩展host在 phase 7 中 MUST continueonly将 `compare` historysave在local，不得将其纳入远端sync载荷。 #### Scenario: Compare workflow completes while sync is enabled
- **WHEN** 扩展host在启用synccapability的情况下完成一轮对比流程
- **THEN** The system MAY 将 `compare` resultwritelocalconversation存储用于recovery
- **AND** The system MUST NOT 将该 `compare` result作为远端sync内容上报 ### Requirement: Extension host MUST expose a knowledge workspace entry with an extension context provider
扩展host MUST provideknowledge workspace入口，并在enter该入口时装配 `DocumentWorkspaceView` 与扩展侧knowledge file provider。该入口 MUST 与现有聊天工作区并存，而不是要求直接改造共享 `conversation-workspace`。 #### Scenario: Mount knowledge workspace in the extension host
- **WHEN** 扩展hostenterknowledge workspace
- **THEN** host MUST render `DocumentWorkspaceView`
- **AND** host MUST 向其注入扩展侧 `IContextProvider` ### Requirement: Extension host MUST persist knowledge documents through extension-managed storage
扩展host MUST 通过扩展可控的存储或桥接capability持久化knowledge workspace中的directory树和document，而不是依赖页面侧不可控的临时内存状态。 #### Scenario: Save a text document in the extension host
- **WHEN** the user在扩展knowledge workspace的text viewer 中savecurrent `text/markdown` 或 `text/plain` document
- **THEN** host MUST 通过扩展侧knowledge file provider 持久化该document内容
- **AND** 后续重新打开该document时 MUST 能recovery已save的内容 #### Scenario: Manage file tree nodes through the extension host
- **WHEN** the user在扩展knowledge workspace中create、delete或renamefile tree节点
- **THEN** host MUST 通过扩展侧knowledge file provider 持久化这些file tree操作
- **AND** 刷新或重新enterknowledge workspace后 MUST 能recovery这些结构变化 #### Scenario: Read a PDF document in the extension host
- **WHEN** the user在扩展knowledge workspace打开一个 `application/pdf` document
- **THEN** host MUST 通过扩展侧knowledge file provider return包含 `mimeType` 与 `dataBase64` 的统一document载荷
- **AND** The system MUST continue使用相同的 `readDocument` 契约，而不是要求独立的 PDF readinterface ### Requirement: Extension host MUST provide top-level switching between knowledge and chat workspaces
扩展host MUST 在top-levelnavigation中providedefault工作区switch入口，使the user可以在knowledge workspace与聊天工作区之间直接switch，而不要求通过内部workflow间接跳转。该switch MUST keep `/compare` continue沿用现有聊天工作区入口。 #### Scenario: Switch between default workspaces in the extension host
- **WHEN** the user通过扩展hosttop-levelnavigation在knowledge workspace与聊天工作区之间switch
- **THEN** host MUST 在 `DocumentWorkspaceView` 与 `ConversationWorkspaceView` 之间switch
- **AND** 知识document存储与聊天工作区运行时 MUST continue分别由各自hostcapability承载 ### Requirement: Extension host MUST provide a visible fallback when embedded PDF preview is unavailable
扩展host在无法稳定内嵌 `blob:` PDF 预览时 MUST provide明确的the uservisible兜底交互，而不是展示空白区域或静默失败。 #### Scenario: Show a fallback entry for unsupported embedded PDF preview
- **WHEN** 扩展环境不support内嵌显示current PDF document
- **THEN** The system MUST 显示“current环境不support内嵌 PDF 预览”之类的明确prompt
- **AND** The system MUST provide在新标签页或等价方式打开该 PDF 的可操作入口
