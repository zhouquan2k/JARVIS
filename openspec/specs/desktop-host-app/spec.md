English | [Chinese](spec.zh-CN.md)

## Purpose
Define desktop host runtime composition for chat, external history, knowledge workspace, login recovery, and top-level workspace switching.
## Requirements
### Requirement: Desktop host MUST initialize shared stores with desktop proxy runtime
桌面host MUST 在启动时初始化普通聊天、external history导入与对比流程所需的 store，并通过 desktop runtime 注入可用 Provider、external history provider 注册表与local持久化实现。host前端 MUST 通过桌面代理运行时访问真实 provider，不得在 renderer 中直接执行网页登录请求。

#### Scenario: Host bootstraps desktop runtime on app load
- **WHEN** 桌面host启动并完成共享工作区初始化
- **THEN** host MUST 为 `useChatStore` 注入modelresolve器、modeldirectoryresolve器、external history provider 注册表和聊天存储实现
- **AND** host MUST 为 `useCompareStore` 注入可按 `providerId` 获取实例的 desktop runtime

### Requirement: Desktop host MUST compose conversation workspace with external history entry points
桌面host MUST 装配共享 `conversation-workspace`，并向侧边栏exposesupport桌面host的history来源switchcapability，以便the user访问localhistory、external history和文件导入入口。

#### Scenario: Mount workspace with source switch enabled
- **WHEN** 桌面hostrender `conversation-workspace`
- **THEN** host MUST 以启用状态传入history来源switchcapability
- **AND** 侧边栏 MUST 显示 `ChatGPT`、`Gemini` 与 `外部文件导入` 等桌面端可用入口

### Requirement: Desktop host MUST provision host-side provider dependencies
桌面host MUST 在 host 侧provide网页登录型 provider 所需的持久化 Session，以及 DOM 型 provider 所需的受控页面执行环境；renderer MUST only通过代理访问这些capability。

#### Scenario: Host provisions session-backed provider dependencies
- **WHEN** 桌面host需要create `chatgpt-web` 这类网页登录型 provider
- **THEN** host MUST 为该 provider provide稳定的持久化 Session 与 Cookie 访问capability
- **AND** renderer MUST NOT 直接接触这些host依赖

#### Scenario: Host provisions controlled-page dependencies
- **WHEN** 桌面host激活 `gemini-web` 这类依赖页面上下文的capability
- **THEN** host MUST 能create或复用受控页面执行环境
- **AND** 后续页面navigation、就绪检测与桥接通信 MUST 由 host 统一管理

### Requirement: Desktop host MUST expose a login entry for unauthenticated ChatGPT Web provider
桌面host MUST 在 `chatgpt-web` 鉴权失败时向the user展示明确的登录入口，而不是只保留被动errorcopy。该登录入口 MUST only在桌面host负责的独立 Session 未登录时出现。

#### Scenario: Show login button when ChatGPT Web is unauthenticated
- **WHEN** 桌面host完成初始化且current `chatgpt-web` 的 `checkAuth()` return失败
- **THEN** 界面 MUST 显示“登录 ChatGPT”入口
- **AND** 界面 MUST 明确promptcurrent桌面host的 ChatGPT 登录态不可用

### Requirement: Desktop host MUST open a session-bound ChatGPT login window
桌面host MUST 通过 host 打开绑定 `persist:chatprism-chatgpt` Session 的登录窗口，以便the user在桌面应用内建立 `chatgpt-web` 所需的 Cookie 与认证状态。

#### Scenario: Open login window from desktop workspace
- **WHEN** the user点击桌面host中的“登录 ChatGPT”入口
- **THEN** renderer MUST 通过host桥接请求 host 打开 ChatGPT 登录窗口
- **AND** host MUST 使用 `chatgpt-web` 对应的持久化 Session 打开 `https://chatgpt.com/`

### Requirement: Desktop host MUST refresh auth state after login window closes
桌面host MUST 在登录窗口关闭后重新检查 `chatgpt-web` 的鉴权状态，并据此update主工作台中的 provider 可用性。

#### Scenario: Refresh auth state after login window is closed
- **WHEN** `chatgpt-web` 的登录窗口被关闭
- **THEN** 桌面host MUST 重新执行一次 `checkAuth()`
- **AND** 当鉴权recovery成功时，主工作台 MUST recovery该 provider 的可用状态

### Requirement: Desktop host MUST expose a knowledge workspace entry with a desktop context provider
桌面host MUST provideknowledge workspace入口，并在enter该入口时装配 `DocumentWorkspaceView` 与桌面侧knowledge file provider。该入口 MUST 独立于现有聊天工作区存在，以便在不改动 `conversation-workspace` 的前提下provide文件浏览和通用document查看/编辑capability。

#### Scenario: Mount knowledge workspace in the desktop host
- **WHEN** 桌面hostenterknowledge workspace
- **THEN** host MUST render `DocumentWorkspaceView`
- **AND** host MUST 向其注入桌面侧 `IContextProvider`

### Requirement: Desktop host MUST provide a desktop-managed knowledge context provider
桌面host MUST 通过桌面侧可控capability为knowledge workspace注入 `IContextProvider`，而 renderer MUST only通过该 provider 访问directory树和document读写interface。该要求 MUST keep与共享knowledge workspace契约一致，而不要求 renderer 理解任何底层存储细节。

#### Scenario: Read write and manage nodes through the desktop context provider
- **WHEN** knowledge workspace在 renderer 中请求directory树read、documentread、documentwrite、节点create、节点delete或节点rename
- **THEN** renderer MUST 通过桌面侧 `IContextProvider` 发起请求
- **AND** 底层存储实现 MUST continue由桌面host受控承载

#### Scenario: Open MIME-aware documents in the desktop host
- **WHEN** 桌面host打开 `text/markdown`、`text/plain` 或 `application/pdf` document
- **THEN** 桌面侧 `IContextProvider.readDocument()` MUST return包含 `mimeType` 与 `dataBase64` 的统一载荷
- **AND** `DocumentWorkspaceView` MUST 根据 MIME resolve对应 viewer，而不是按扩展名分支

### Requirement: Desktop host MUST provide top-level switching between knowledge and chat workspaces
桌面host MUST 在top-levelnavigation中providedefault工作区switch入口，使the user可以在knowledge workspace与聊天工作区之间直接switch。该switch MUST 与现有桌面聊天运行时compatible，且 MUST NOT 把 `/compare` 提升为新的top-level工作区菜单项。

#### Scenario: Switch from chat workspace back to knowledge workspace from the top bar
- **WHEN** the user位于桌面host的聊天工作区并通过top-levelnavigation选择knowledge workspace
- **THEN** host MUST switch到 `DocumentWorkspaceView`
- **AND** 桌面侧knowledge file provider MUST continue作为该view的document访问入口

### Requirement: Desktop host MUST provision preload-enabled controlled pages for Gemini history
桌面host MUST 为 `gemini-web` 这类依赖页面上下文的historycapabilityprovide可复用的受控页面，并allow该页面mount专用 preload，以便主进程 bridge 复用共享 Gemini DOM 抽取逻辑。

#### Scenario: Create or reuse a controlled Gemini page with preload
- **WHEN** desktop 主进程首次resolve `gemini-web` history provider，或后续再次请求 Gemini history
- **THEN** host MUST 通过受控页面管理器create或复用 Gemini 页面
- **AND** 该页面 MUST supportconfiguration Gemini 专用 `preloadPath`
- **AND** 页面default MUST 以隐藏方式运行，而不是主动弹出给the user

### Requirement: Desktop host MUST expose a login entry for unauthenticated Gemini history
桌面host MUST 在currentexternal history来源为 `gemini-web` 且error为 `AUTH_REQUIRED` 时，向the user展示明确的 `登录 Gemini` 入口，而不是只保留被动errorcopy。

#### Scenario: Show Gemini login entry in the desktop workspace
- **WHEN** 共享工作台current处于 `gemini-web` external historylist或预览态，且 desktop hostreturn `AUTH_REQUIRED`
- **THEN** renderer MUST 显示 `登录 Gemini` recovery入口
- **AND** the user触发该入口后 MUST 通过host桥接请求 host 打开 `gemini-web` 登录窗口

### Requirement: Desktop host MUST refresh Gemini history after the login window closes
桌面host MUST 在 Gemini 登录窗口关闭后通知 renderer 刷新currentexternal historyview，以便the user完成登录后可以直接重新load Gemini historylist，而不要求手动重启应用或switchhost。

#### Scenario: Refresh current Gemini history view after login closes
- **WHEN** the user关闭 `gemini-web` 登录窗口，且current工作台仍停留在 `gemini-web` external history来源
- **THEN** desktop host MUST 通知 renderer 执行一次 `chatStore.loadExternalHistory('gemini-web')`
- **AND** The system MUST continue复用 `persist:chatprism-gemini` Session，而不是新建临时登录态

### Requirement: Desktop host MUST operate without a local server process
The desktop host SHALL start and provide the knowledge workspace, task views, and conversation history without any locally running HTTP server. The renderer MUST load from a locally bundled asset (file or custom protocol), not from a server origin.

#### Scenario: Desktop starts with no server and no network
- **WHEN** the desktop app launches while offline and no local server process exists
- **THEN** the renderer MUST load and render the workspace
- **AND** documents under the local knowledge root MUST be readable and writable
- **AND** conversations and tasks MUST be readable and writable from local replicas

### Requirement: Desktop host MUST deliver the knowledge context provider over IPC
The desktop host SHALL host the filesystem context provider in the main process and expose it to the renderer through an IPC bridge implementing the shared `IContextProvider` contract. Every `IContextProvider` method MUST have a corresponding IPC channel.

#### Scenario: Document operations flow through IPC
- **WHEN** the renderer performs directory listing, document read/write, node create/delete/rename, or attachment upload
- **THEN** the request MUST travel over the IPC bridge to the main-process provider
- **AND** behavior MUST match the shared knowledge workspace contract exactly

### Requirement: Desktop host MUST reach the remote sync hub via main-proxied fetch
Record sync (conversations, tasks) from the desktop renderer SHALL execute HTTP through a main-process-proxied fetch injected as `fetchImpl`, so that sync works from a non-HTTP renderer origin without CORS configuration on the hub.

#### Scenario: Sync succeeds from a locally loaded renderer
- **WHEN** the renderer pushes or pulls records against the configured hub URL
- **THEN** the HTTP request MUST be executed by the main process on the renderer's behalf
- **AND** the hub MUST NOT require CORS allowances for desktop origins

