## MODIFIED Requirements

### Requirement: Extension host MUST initialize shared stores with proxy runtime
扩展全窗口宿主 MUST 在启动时同时初始化普通聊天、历史导入与对比流程所需的 store，并通过 extension runtime 注入可用 Provider、外部历史 provider 注册表与同步存储实现；同步命名空间 MUST 由设置中的 `syncKey` 决定。该 runtime 还 MUST 能支持经 Background 代理转发的多模态发送能力，并驱动共享 `conversation-workspace`。

#### Scenario: Host bootstraps runtime and stores on page load
- **WHEN** 扩展全窗口页面完成初始化
- **THEN** 宿主 MUST 为 `useChatStore` 注入模型解析器、外部历史 provider 注册表与 `SyncStorageProvider`
- **AND** 宿主 MUST 为 `useCompareStore` 注入可按 `providerId` 获取实例的 runtime，并仅暴露 extension 运行模式可用 Provider

#### Scenario: Extension host validates syncKey before enabling sync
- **WHEN** 扩展宿主初始化同步能力并读取到 `syncKey = "0"`
- **THEN** 开发环境 MUST 允许继续初始化
- **AND** 非开发环境 MUST 阻止同步初始化并提示用户配置真实 `syncKey`

#### Scenario: Extension host pushes pre-existing local unsynced conversations on every startup
- **WHEN** 扩展宿主启动时本地存储中已经存在普通聊天会话或已导入外部历史，但这些记录尚未进入远端服务端
- **THEN** 宿主 MUST 在初始化 `SyncStorageProvider` 后触发包含补偿语义的 `hydrate()`
- **AND** 该次启动的同步 MUST 将这些本地旧记录推送到当前 `syncKey` 对应的远端命名空间

## ADDED Requirements

### Requirement: Extension host MUST compose conversation workspace with proxy-backed multimodal runtime
扩展宿主 MUST 将共享 `conversation-workspace` 与基于 Background Proxy 的 provider runtime 组合起来，使普通聊天工作区能够发送带附件的请求并恢复结构化消息内容。

#### Scenario: Mount workspace with proxy-backed providers
- **WHEN** 扩展宿主完成 provider runtime 初始化
- **THEN** 宿主 MUST 将基于 proxy 的 provider 解析器、模型目录解析器和历史 provider 注入共享工作区
- **AND** 工作区 MUST 能消费来自 Background 的标准化 `text + annotations` 更新

### Requirement: Extension host MUST expose history source switch in sidebar
扩展宿主 MUST 在共享侧边栏中启用“本地 / 外部”一级来源切换，并在外部来源下暴露 `ChatGPT`、`Gemini` 与 `外部文件导入` 的二级入口。

#### Scenario: Mount workspace with source switch enabled
- **WHEN** 扩展宿主渲染 `conversation-workspace`
- **THEN** 宿主 MUST 以启用状态传入“本地 / 外部”来源切换能力
- **AND** 侧边栏 MUST 在外部来源下显示 `ChatGPT`、`Gemini` 与 `外部文件导入` 入口

### Requirement: Extension host MUST provision Gemini history runtime dependencies
扩展宿主 MUST 为 Gemini 历史提供者装配远程配置加载器、受控标签页桥接和内容脚本通信能力，使其能够在扩展运行时工作。

#### Scenario: Activate Gemini external history in extension host
- **WHEN** 用户在扩展宿主的外部来源中切换到 `Gemini`
- **THEN** 宿主 MUST 能解析并激活 Gemini 历史 provider
- **AND** 后续历史查询 MUST 通过 Background 与 Gemini 页面桥接完成

### Requirement: Extension host MUST keep compare persistence local-only during phase 7
扩展宿主在 phase 7 中 MUST 继续仅将 `compare` 历史保存在本地，不得将其纳入远端同步载荷。

#### Scenario: Compare workflow completes while sync is enabled
- **WHEN** 扩展宿主在启用同步能力的情况下完成一轮对比流程
- **THEN** 系统 MAY 将 `compare` 结果写入本地会话存储用于恢复
- **AND** 系统 MUST NOT 将该 `compare` 结果作为远端同步内容上报

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
