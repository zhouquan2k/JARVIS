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
