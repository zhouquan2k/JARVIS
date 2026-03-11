## MODIFIED Requirements

### Requirement: Extension host MUST initialize shared stores with proxy runtime
扩展全窗口宿主 MUST 在启动时同时初始化普通聊天、历史导入与对比流程所需的 store，并通过 extension runtime 注入可用 Provider、历史 provider 与同步存储实现；同步命名空间 MUST 由设置中的 `syncKey` 决定。该 runtime 还 MUST 能支持经 Background 代理转发的多模态发送能力，并驱动共享 `conversation-workspace`。

#### Scenario: Host bootstraps runtime and stores on page load
- **WHEN** 扩展全窗口页面完成初始化
- **THEN** 宿主 MUST 为 `useChatStore` 注入模型解析器、历史 provider 与 `SyncStorageProvider`
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
扩展宿主 MUST 在共享侧边栏中启用“聊天/导入”来源切换，允许用户在本地会话与外部导入历史之间快速切换。

#### Scenario: Mount workspace with source switch enabled
- **WHEN** 扩展宿主渲染 `conversation-workspace`
- **THEN** 宿主 MUST 以启用状态传入历史来源切换能力（如 `showHistorySourceSwitch = true`）
- **AND** 侧边栏 MUST 显示“聊天/导入”切换按钮组

### Requirement: Extension host MUST keep compare persistence local-only during phase 7
扩展宿主在 phase 7 中 MUST 继续仅将 `compare` 历史保存在本地，不得将其纳入远端同步载荷。

#### Scenario: Compare workflow completes while sync is enabled
- **WHEN** 扩展宿主在启用同步能力的情况下完成一轮对比流程
- **THEN** 系统 MAY 将 `compare` 结果写入本地会话存储用于恢复
- **AND** 系统 MUST NOT 将该 `compare` 结果作为远端同步内容上报
