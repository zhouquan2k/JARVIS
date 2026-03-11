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
