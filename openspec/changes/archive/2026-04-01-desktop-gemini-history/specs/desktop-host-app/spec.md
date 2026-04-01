## ADDED Requirements

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
