## ADDED Requirements

### Requirement: Desktop host MUST initialize shared stores with desktop proxy runtime
桌面宿主 MUST 在启动时初始化普通聊天、外部历史导入与对比流程所需的 store，并通过 desktop runtime 注入可用 Provider、外部历史 provider 注册表与本地持久化实现。宿主前端 MUST 通过桌面代理运行时访问真实 provider，不得在 renderer 中直接执行网页登录请求。

#### Scenario: Host bootstraps desktop runtime on app load
- **WHEN** 桌面宿主启动并完成共享工作区初始化
- **THEN** 宿主 MUST 为 `useChatStore` 注入模型解析器、模型目录解析器、外部历史 provider 注册表和聊天存储实现
- **AND** 宿主 MUST 为 `useCompareStore` 注入可按 `providerId` 获取实例的 desktop runtime

### Requirement: Desktop host MUST compose conversation workspace with external history entry points
桌面宿主 MUST 装配共享 `conversation-workspace`，并向侧边栏暴露支持桌面宿主的历史来源切换能力，以便用户访问本地历史、外部历史和文件导入入口。

#### Scenario: Mount workspace with source switch enabled
- **WHEN** 桌面宿主渲染 `conversation-workspace`
- **THEN** 宿主 MUST 以启用状态传入历史来源切换能力
- **AND** 侧边栏 MUST 显示 `ChatGPT`、`Gemini` 与 `外部文件导入` 等桌面端可用入口

### Requirement: Desktop host MUST provision host-side provider dependencies
桌面宿主 MUST 在 host 侧提供网页登录型 provider 所需的持久化 Session，以及 DOM 型 provider 所需的受控页面执行环境；renderer MUST 仅通过代理访问这些能力。

#### Scenario: Host provisions session-backed provider dependencies
- **WHEN** 桌面宿主需要创建 `chatgpt-web` 这类网页登录型 provider
- **THEN** host MUST 为该 provider 提供稳定的持久化 Session 与 Cookie 访问能力
- **AND** renderer MUST NOT 直接接触这些宿主依赖

#### Scenario: Host provisions controlled-page dependencies
- **WHEN** 桌面宿主激活 `gemini-web` 这类依赖页面上下文的能力
- **THEN** host MUST 能创建或复用受控页面执行环境
- **AND** 后续页面导航、就绪检测与桥接通信 MUST 由 host 统一管理

### Requirement: Desktop host MUST expose a login entry for unauthenticated ChatGPT Web provider
桌面宿主 MUST 在 `chatgpt-web` 鉴权失败时向用户展示明确的登录入口，而不是只保留被动错误文案。该登录入口 MUST 仅在桌面宿主负责的独立 Session 未登录时出现。

#### Scenario: Show login button when ChatGPT Web is unauthenticated
- **WHEN** 桌面宿主完成初始化且当前 `chatgpt-web` 的 `checkAuth()` 返回失败
- **THEN** 界面 MUST 显示“登录 ChatGPT”入口
- **AND** 界面 MUST 明确提示当前桌面宿主的 ChatGPT 登录态不可用

### Requirement: Desktop host MUST open a session-bound ChatGPT login window
桌面宿主 MUST 通过 host 打开绑定 `persist:chatprism-chatgpt` Session 的登录窗口，以便用户在桌面应用内建立 `chatgpt-web` 所需的 Cookie 与认证状态。

#### Scenario: Open login window from desktop workspace
- **WHEN** 用户点击桌面宿主中的“登录 ChatGPT”入口
- **THEN** renderer MUST 通过宿主桥接请求 host 打开 ChatGPT 登录窗口
- **AND** host MUST 使用 `chatgpt-web` 对应的持久化 Session 打开 `https://chatgpt.com/`

### Requirement: Desktop host MUST refresh auth state after login window closes
桌面宿主 MUST 在登录窗口关闭后重新检查 `chatgpt-web` 的鉴权状态，并据此更新主工作台中的 provider 可用性。

#### Scenario: Refresh auth state after login window is closed
- **WHEN** `chatgpt-web` 的登录窗口被关闭
- **THEN** 桌面宿主 MUST 重新执行一次 `checkAuth()`
- **AND** 当鉴权恢复成功时，主工作台 MUST 恢复该 provider 的可用状态

### Requirement: Desktop host MUST expose a knowledge workspace entry with a desktop context provider
桌面宿主 MUST 提供知识工作区入口，并在进入该入口时装配 `KnowledgeWorkspaceView` 与桌面侧知识文件 Provider。该入口 MUST 独立于现有聊天工作区存在，以便在不改动 `conversation-workspace` 的前提下提供文件浏览和单栏所见即所得 Markdown 编辑能力。

#### Scenario: Mount knowledge workspace in the desktop host
- **WHEN** 桌面宿主进入知识工作区
- **THEN** 宿主 MUST 渲染 `KnowledgeWorkspaceView`
- **AND** 宿主 MUST 向其注入桌面侧 `IContextProvider`

### Requirement: Desktop host MUST provide a desktop-managed knowledge context provider
桌面宿主 MUST 通过桌面侧可控能力为知识工作区注入 `IContextProvider`，而 renderer MUST 仅通过该 provider 访问目录树和文档读写接口。该要求 MUST 保持与共享知识工作区契约一致，而不要求 renderer 理解任何底层存储细节。

#### Scenario: Read and write documents through the desktop context provider
- **WHEN** 知识工作区在 renderer 中请求目录树读取、文档读取或文档写入
- **THEN** renderer MUST 通过桌面侧 `IContextProvider` 发起请求
- **AND** 底层存储实现 MUST 继续由桌面宿主受控承载

### Requirement: Desktop host MUST provide top-level switching between knowledge and chat workspaces
桌面宿主 MUST 在顶层导航中提供默认工作区切换入口，使用户可以在知识工作区与聊天工作区之间直接切换。该切换 MUST 与现有桌面聊天运行时兼容，且 MUST NOT 把 `/compare` 提升为新的顶层工作区菜单项。

#### Scenario: Switch from chat workspace back to knowledge workspace from the top bar
- **WHEN** 用户位于桌面宿主的聊天工作区并通过顶层导航选择知识工作区
- **THEN** 宿主 MUST 切换到 `KnowledgeWorkspaceView`
- **AND** 桌面侧知识文件 Provider MUST 继续作为该视图的文档访问入口

### Requirement: Desktop host MUST provision preload-enabled controlled pages for Gemini history
桌面宿主 MUST 为 `gemini-web` 这类依赖页面上下文的历史能力提供可复用的受控页面，并允许该页面挂载专用 preload，以便主进程 bridge 复用共享 Gemini DOM 抽取逻辑。

#### Scenario: Create or reuse a controlled Gemini page with preload
- **WHEN** desktop 主进程首次解析 `gemini-web` 历史 provider，或后续再次请求 Gemini 历史
- **THEN** 宿主 MUST 通过受控页面管理器创建或复用 Gemini 页面
- **AND** 该页面 MUST 支持配置 Gemini 专用 `preloadPath`
- **AND** 页面默认 MUST 以隐藏方式运行，而不是主动弹出给用户

### Requirement: Desktop host MUST expose a login entry for unauthenticated Gemini history
桌面宿主 MUST 在当前外部历史来源为 `gemini-web` 且错误为 `AUTH_REQUIRED` 时，向用户展示明确的 `登录 Gemini` 入口，而不是只保留被动错误文案。

#### Scenario: Show Gemini login entry in the desktop workspace
- **WHEN** 共享工作台当前处于 `gemini-web` 外部历史列表或预览态，且 desktop 宿主返回 `AUTH_REQUIRED`
- **THEN** renderer MUST 显示 `登录 Gemini` 恢复入口
- **AND** 用户触发该入口后 MUST 通过宿主桥接请求 host 打开 `gemini-web` 登录窗口

### Requirement: Desktop host MUST refresh Gemini history after the login window closes
桌面宿主 MUST 在 Gemini 登录窗口关闭后通知 renderer 刷新当前外部历史视图，以便用户完成登录后可以直接重新加载 Gemini 历史列表，而不要求手动重启应用或切换宿主。

#### Scenario: Refresh current Gemini history view after login closes
- **WHEN** 用户关闭 `gemini-web` 登录窗口，且当前工作台仍停留在 `gemini-web` 外部历史来源
- **THEN** desktop 宿主 MUST 通知 renderer 执行一次 `chatStore.loadExternalHistory('gemini-web')`
- **AND** 系统 MUST 继续复用 `persist:chatprism-gemini` Session，而不是新建临时登录态
