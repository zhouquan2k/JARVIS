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

### Requirement: Extension host MUST expose history source switch in sidebar
扩展宿主 MUST 在共享侧边栏中启用“本地 / 外部”一级来源切换，并在外部来源下暴露 `ChatGPT`、`Gemini` 与 `外部文件导入` 的二级入口。

#### Scenario: Mount workspace with source switch enabled
- **WHEN** 扩展宿主渲染 `conversation-workspace`
- **THEN** 宿主 MUST 以启用状态传入“本地 / 外部”来源切换能力
- **AND** 侧边栏 MUST 在外部来源下显示 `ChatGPT`、`Gemini` 与 `外部文件导入` 入口

## ADDED Requirements

### Requirement: Extension host MUST provision Gemini history runtime dependencies
扩展宿主 MUST 为 Gemini 历史提供者装配远程配置加载器、受控标签页桥接和内容脚本通信能力，使其能够在扩展运行时工作。

#### Scenario: Activate Gemini external history in extension host
- **WHEN** 用户在扩展宿主的外部来源中切换到 `Gemini`
- **THEN** 宿主 MUST 能解析并激活 Gemini 历史 provider
- **AND** 后续历史查询 MUST 通过 Background 与 Gemini 页面桥接完成
