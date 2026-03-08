## ADDED Requirements

### Requirement: Extension host MUST mount a conversation workspace shell
扩展全窗口宿主 MUST 提供一个高于具体聊天视图的工作台容器，以承载历史边栏、来源切换和右侧视图区域。

#### Scenario: Host mounts workspace shell
- **WHEN** 扩展全窗口页面进入聊天主界面
- **THEN** 宿主 MUST 渲染统一的 workspace 容器而不是直接裸挂 `NormalChatView`
- **AND** 该容器 MUST 为右侧视图提供历史边栏上下文与当前模式信息

## MODIFIED Requirements

### Requirement: Extension host MUST provide normal/compare mode switching
扩展全窗口宿主 MUST 复用共享 UI 视图并提供普通聊天与对比聊天双模式切换入口，且两种模式 MUST 在同一个 workspace 容器中切换右侧内容视图。

#### Scenario: User switches between normal and compare modes in extension host
- **WHEN** 用户在扩展全窗口宿主中切换模式
- **THEN** 系统 MUST 保持 workspace 容器持续存在
- **AND** 在普通模式渲染 `NormalChatView`
- **AND** 在对比模式渲染 `CompareChatView`，并保持当前模式状态可恢复。

### Requirement: Extension host MUST initialize shared stores with proxy runtime
扩展全窗口宿主 MUST 在启动时同时初始化普通聊天、历史导入与对比流程所需的 store，并通过 extension runtime 注入可用 Provider 与存储实现。

#### Scenario: Host bootstraps runtime and stores on page load
- **WHEN** 扩展全窗口页面完成初始化
- **THEN** 宿主 MUST 为 `useChatStore` 注入模型解析器、历史 provider 与 `IndexedDBStorageProvider`
- **AND** 宿主 MUST 为 `useCompareStore` 注入可按 `providerId` 获取实例的 runtime，并仅暴露 extension 运行模式可用 Provider。

### Requirement: Extension host MUST hydrate provider model catalogs before enabling selection
扩展全窗口宿主 MUST 让普通聊天和对比聊天的模型选择器等待 provider 返回的动态模型目录，而不是直接依赖静态配置。

#### Scenario: Host resolves provider models during initialization
- **WHEN** 扩展全窗口页面初始化默认 provider
- **THEN** 宿主 MUST 触发对应 provider 的模型目录查询
- **AND** 普通聊天与对比聊天 UI MUST 在模型目录结果返回或 fallback 生效后再开放模型选择

#### Scenario: Configured preferred default model is missing from dynamic catalog
- **WHEN** runtime 已成功拿到 provider 的动态模型目录，但静态配置声明的偏好默认模型不存在于该目录中
- **THEN** 宿主 MUST 显式暴露错误信息
- **AND** 系统 MUST NOT 静默回退到其他默认模型继续初始化
