## ADDED Requirements

### Requirement: Extension action MUST open full-window host page
浏览器插件 MUST 将工具栏图标点击行为映射为打开扩展内部全窗口页面（`index.html`）的新标签页，而不是 sidepanel 或 popup。

#### Scenario: User clicks extension action icon
- **WHEN** 用户点击浏览器工具栏中的 ChatPrism 插件图标
- **THEN** Background MUST 通过 `chrome.tabs.create` 打开 `chrome.runtime.getURL('index.html')`
- **AND** 打开的页面 MUST 作为插件主宿主承载聊天与对比功能。

### Requirement: Extension host MUST provide normal/compare mode switching
扩展全窗口宿主 MUST 复用共享 UI 视图并提供普通聊天与对比聊天双模式切换入口，保证切换后渲染对应视图。

#### Scenario: User switches between normal and compare modes in extension host
- **WHEN** 用户在扩展全窗口宿主中切换模式
- **THEN** 系统 MUST 在普通模式渲染 `NormalChatView`
- **AND** 在对比模式渲染 `CompareChatView`，并保持当前模式状态可恢复。

### Requirement: Extension host MUST initialize shared stores with proxy runtime
扩展全窗口宿主 MUST 在启动时同时初始化普通聊天与对比流程所需的 store，并通过 extension runtime 注入可用 Provider 与存储实现。

#### Scenario: Host bootstraps runtime and stores on page load
- **WHEN** 扩展全窗口页面完成初始化
- **THEN** 宿主 MUST 为 `useChatStore` 注入模型解析器与 `IndexedDBStorageProvider`
- **AND** 宿主 MUST 为 `useCompareStore` 注入可按 `providerId` 获取实例的 runtime，并仅暴露 extension 运行模式可用 Provider。

### Requirement: Extension host MUST persist compare conversations with analysis result
扩展全窗口宿主 MUST 在对比流程完成后持久化对比会话数据，至少包含 prompt、A/B 输出与分析结构化结果，以支持历史恢复。

#### Scenario: Compare workflow completes in extension host
- **WHEN** 对比工作流进入完成态且已获得分析结果
- **THEN** 系统 MUST 将对比相关字段写入会话存储
- **AND** 用户重新进入扩展页面时 MUST 能恢复该轮对比结果。
